---
title: "From X Space to Podcast Feed in (Almost) One Command"
date: "2026-10-31"
category: "Software Engineering"
excerpt: "How I turned my brother's recorded X Spaces into a real podcast feed with yt-dlp, whisper.cpp, a few idempotent shell scripts, and a static Astro site."
read_time: "8"
---

My brother JT hosts live X Spaces, and he wanted them to exist as a podcast too. The problem was that a Space is a terrible archive format. It lives inside X, you can't subscribe to it from Apple Podcasts or Spotify, and the recording is only there for as long as X decides to keep it.

So I built a small pipeline for his site, jtworldteacher.com. You give it Space URLs, and it downloads the audio, transcribes it, writes catalog entries and episode pages, and the site build produces an RSS feed that the podcast directories read. This post walks through how it works, which parts actually run from one command, and what I'd change.

## The Shape of the Pipeline

The whole thing is a few Bash scripts, a folder of markdown, and an Astro site. There is no database and no server. **Every stage reads files and writes files**, and the presence of a file is the only state.

```
 queue.txt (Space URLs)
        |
        v
 parallel-pipeline.sh
   |-- download-space.sh x4 --> spaces/audio/<date>-<slug>.m4a   (git-ignored)
   |      (yt-dlp)          --> posts/<date>-<slug>-space.md     (catalog stub)
   |
   '-- transcribe-pending.sh --watch
          (ffmpeg -> 16 kHz WAV -> whisper-cli)
                            --> spaces/transcripts/<slug>.txt + .vtt
        |
        v
 trim intro/outro (ffmpeg, by hand)
        |
        v
 generate-episode-pages.sh --> site/src/content/episodes/<slug>.md
        |
        v
 rclone copy --> Cloudflare R2 --> media.jtworldteacher.com/episodes/<slug>.m4a
        |
        v
 git push main --> GitHub Actions: npm run build --> GitHub Pages
                                    (Zod schema check, dist/feed.xml)
```

The "one command" is `bash catalog/scripts/parallel-pipeline.sh queue.txt`. It handles the slow, boring part: getting the audio and a transcript for every URL in a queue. Everything after it is a short, deliberate step, and I'll explain why some of those are still manual.

## Stage 1: Downloading the Space

X doesn't offer a download button, but **yt-dlp** has an extractor for Spaces. As long as the host enabled recording, yt-dlp can resolve the URL and pull the audio as an `.m4a`.

`download-space.sh` handles one URL. It first asks yt-dlp for metadata without downloading anything, builds a filename from the date and a slugified title, and only downloads if that file isn't already there:

```bash
meta=$(yt-dlp --print "%(id)s|%(title)s|%(upload_date)s" --skip-download "$url" 2>/dev/null | tail -1)
IFS='|' read -r space_id title upload_date <<< "$meta"
[[ -n "$space_id" ]] || { echo "[$url] could not resolve, skipping"; exit 0; }

date_iso="${upload_date:0:4}-${upload_date:4:2}-${upload_date:6:2}"
slug=$(slugify "$title")
base="${date_iso}-${slug}"
m4a="$AUDIO_DIR/${base}.m4a"
post="$POSTS_DIR/${base}-space.md"

if [[ -f "$m4a" ]]; then
  echo "[$base] audio already present, skipping download"
else
  yt-dlp -q -o "$m4a" "$url"
  # ...
fi

# Stub catalog post — only created on first run, never overwrites human edits.
if [[ ! -f "$post" ]]; then
  # ... write frontmatter: date, space_id, space_url, space_title,
  # ... audio, audio_bytes, transcript, source_tweet, topics, source
fi
```

The `YYYY-MM-DD-slug` name is the key that ties everything together. The audio file, the transcript, the catalog stub, and the episode page all share it, so every later stage can find its inputs by name alone.

The catalog stub is a small markdown file with YAML frontmatter: the Space ID and URL, the original title, the audio path, the exact byte count, and the transcript path. It's the record that "this Space exists and we have it." **The script writes the stub once and never touches it again**, so any notes added by hand are safe on a re-run.

## Stage 2: Transcription

Transcripts come from **whisper.cpp** (`whisper-cli`) with the `ggml-large-v3-turbo` model, which is a good balance of speed and accuracy on an Apple Silicon Mac. The Homebrew build only reads WAV input, so each file is converted first:

```bash
ffmpeg -y -loglevel error -i "$m4a" -ar 16000 -ac 1 -c:a pcm_s16le "$wav"
whisper-cli -m "$MODEL" -f "$wav" -otxt -ovtt -of "$TRANSCRIPT_DIR/${base}" >/dev/null 2>&1
rm -f "$wav"
```

That produces a plain `.txt` and a timestamped `.vtt`. The transcripts are committed to git; the audio is git-ignored because the files are large.

## Stage 3: Running It in Parallel

The first version, `process-spaces.sh`, did everything in one sequential loop. That works, but it wastes time: downloading is network-bound and transcription is GPU-bound, so doing them one after the other leaves one resource idle at all times.

`parallel-pipeline.sh` splits them. It starts a transcription watcher in the background, then fans the downloads out with `xargs`:

```bash
bash "$SCRIPT_DIR/transcribe-pending.sh" --watch &
WATCHER_PID=$!

grep -vE '^[[:space:]]*(#|$)' "$queue" \
  | xargs -n1 -P "$parallel" -I{} bash "$SCRIPT_DIR/download-space.sh" "{}"

touch "$AUDIO_DIR/.stop-transcriber"
wait "$WATCHER_PID"
```

Downloads run four at a time by default. **Transcription stays strictly sequential**, because running several whisper jobs on one GPU makes them all slower. The watcher wakes up every 10 seconds, transcribes any `.m4a` without a matching `.txt`, and skips files that are still being written (`.part` files, or anything modified in the last 5 seconds). When the downloads finish, the pipeline drops a `.stop-transcriber` flag file, and the watcher does one final pass and exits.

## Idempotency: Just Run It Again

Every stage checks for its output before doing work:

- **Audio exists?** Skip the download.
- **Transcript exists?** Skip transcription.
- **Catalog stub exists?** Leave it alone.
- **Episode page exists?** Don't regenerate it.

That makes the failure story very simple. If a download dies, or the laptop sleeps halfway through a two-hour transcription, I run the same command again and it picks up where it stopped. I never had to write any resume logic, because "resume" is just "skip what's done."

## Stage 4: Editing to the Show

Raw Space recordings start with hold music and pre-show chatter, and they often end with dead air. Those get cut, but **only at the start and end, never inside the show**.

This step is still manual on purpose. I find cut points at real pauses with `ffmpeg -af silencedetect`, then trim with stream copy and an input seek (`ffmpeg -ss <start> -t <len> -i orig.m4a -c copy`) so there's no re-encode. Rather than re-transcribing, I shift the `.vtt` cues by the start offset and drop the cut lines from the `.txt`. Whisper also tends to render dead air as repeated filler lines, and those go out with the trim.

## Stage 5: Episode Pages

`generate-episode-pages.sh` walks every `.m4a`, finds the matching catalog stub, and writes an episode markdown file for the site. It measures the audio with `stat` and `ffprobe`, so the numbers in the feed come from the actual file:

```bash
bytes="$(stat -f "%z" "$m4a")"
secs="$(ffprobe -i "$m4a" -show_entries format=duration -v quiet -of csv="p=0" 2>/dev/null | cut -d. -f1)"
hh=$((secs/3600)); mm=$(((secs%3600)/60)); ss=$((secs%60))
duration=$(printf "%d:%02d:%02d" "$hh" "$mm" "$ss")
# ...
audioUrl: "${R2_DOMAIN}/episodes/${base}.m4a"
audioLength: ${bytes}
audioType: "audio/mp4"
duration: "${duration}"
durationSeconds: ${secs}
```

Like the stubs, **existing episode files are never overwritten**, so hand-written show notes survive. The generated page is a placeholder with a "detailed show notes coming" description; the real write-up gets added afterward.

Two details here matter more than they look. Apple Podcasts requires `audioLength`, and it has to be the exact byte count of the hosted file. And the MIME type for `.m4a` is `audio/mp4`, not `audio/m4a`.

## Stage 6: Hosting the Audio

GitHub Pages is fine for HTML but not for serving large media files at scale, so the audio lives in **Cloudflare R2** behind its own subdomain, `media.jtworldteacher.com`. Upload is one `rclone` command:

```bash
rclone copy catalog/spaces/audio/<slug>.m4a r2:<bucket>/episodes/ \
  --metadata --metadata-set content-type=audio/mp4
```

The explicit content type is there because rclone on macOS guesses `audio/mp4a-latm` for `.m4a`, which is wrong for an MP4 container. Putting the audio on its own subdomain also means I could move it to a different host later by changing one DNS record, without changing a single enclosure URL.

## Stage 7: The Feed

The site is Astro. Episodes are a content collection with a **Zod schema**, so `npm run build` fails if an episode is missing a field or has the wrong type: `audioUrl` must be a URL, `audioLength` and `durationSeconds` must be positive integers, `episodeType` must be `full`, `trailer`, or `bonus`, and so on.

The feed itself is a single endpoint, `src/pages/feed.xml.ts`, built on `@astrojs/rss`. Show-level iTunes and Podcasting 2.0 tags go in the channel's `customData`, and each non-draft episode becomes an item:

```ts
items: episodes.map((ep) => {
  const slug = ep.id.replace(/\.md$/, '');
  const episodeUrl = absolute(`podcast/${slug}/`);
  // ...
  return {
    title: ep.data.title,
    pubDate: ep.data.pubDate,
    description: ep.data.description,
    content: bodyHtml || undefined,
    link: episodeUrl,
    enclosure: {
      url: ep.data.audioUrl,
      length: ep.data.audioLength,
      type: ep.data.audioType,
    },
    customData: `
      <itunes:title>${xmlEscape(ep.data.title)}</itunes:title>
      <itunes:duration>${ep.data.duration}</itunes:duration>
      <itunes:episodeType>${ep.data.episodeType}</itunes:episodeType>
      <itunes:explicit>${ep.data.explicit}</itunes:explicit>
      ${ep.data.season ? `<itunes:season>${ep.data.season}</itunes:season>` : ''}
      ${ep.data.episode ? `<itunes:episode>${ep.data.episode}</itunes:episode>` : ''}
      <itunes:image href="${xmlEscape(episodeImage)}" />
    `.trim(),
  };
}),
```

A few things worth calling out:

- **Item GUIDs come from the link.** `@astrojs/rss` emits `<guid isPermaLink="true">` set to the episode page URL, so each episode's identity is its `/podcast/<slug>/` URL.
- **The show has a `podcast:guid`**, which is the Podcasting 2.0 UUIDv5 of the feed URL, plus `podcast:locked` and the usual `itunes:owner`, `itunes:category`, and `itunes:image` tags.
- **Show notes go in `content:encoded`**, rendered from the episode's markdown body with `marked`.
- **`draft: true` keeps an episode out of the feed** and off the episode list, which is handy for staging.

Publishing is `git push`. A GitHub Actions workflow runs `npm ci` and `npm run build` in `site/` and deploys `dist/` to GitHub Pages. Before the first submission I also ran the feed through an external validator. Its one red mark was byte-range support, which turned out to be a false negative: a `curl` with a `Range` header against R2 returns a proper `206 Partial Content`.

## Trade-offs

**Files over a database.** File existence as state is crude, but it means every stage is inspectable with `ls` and re-runs are free.

**Git as the publish step.** Adding an episode is a commit, so every change to the feed is reviewable and reversible. The cost is that publishing requires a git checkout and a push rather than a button.

**Static site plus object storage.** No server to maintain and nothing running between episodes. The catch is that the site and the audio live in two places, and nothing checks automatically that they agree.

**Manual judgment where it matters.** Choosing trim points stays human, because cutting into the actual show is far worse than leaving a little hold music in.

## What I'd Do Differently

The title says "almost" for a reason, and most of what I'd change comes from actual rough edges in the code.

1. **Make it truly one command.** `parallel-pipeline.sh` stops at audio, transcripts, and catalog stubs. Episode pages, upload, and build are separate steps, and some of the docs still describe the pipeline as if it does more than it does.
2. **Fix slugify.** It lowercases and then does `cut -c1-60`, which can chop a word in half. Since the slug ends up in the audio URL, and published enclosure URLs should never move, an ugly truncation becomes permanent.
3. **Use the air date, not `upload_date`.** For a scheduled Space, yt-dlp's `upload_date` is when the Space was created, which can be days before it aired. The newer tooling checks `release_timestamp`; the original download scripts still name files by `upload_date`.
4. **Give episodes a stable GUID.** Tying the GUID to the page URL means renaming an episode file would make podcast apps see a brand-new episode. The Space ID is already in the frontmatter and would be a better identity.
5. **Don't skip by date prefix.** `generate-episode-pages.sh` skips any audio file whose date matches an existing episode, to cope with a few hand-named early episodes. That also means a second Space on the same day gets silently counted as "already exists."
6. **Fail loudly in transcription.** whisper's output goes to `/dev/null`, and given non-WAV input it exits 0 without writing anything. Re-runs recover, but the only sign of failure is a missing `.txt`.
7. **Verify the upload automatically.** Checking that R2 reports the same `Content-Length` as `audioLength`, the right `Content-Type`, and a `206` for a range request is currently a manual `curl`. It should be a script.
8. **Stop assuming macOS.** `stat -f "%z"`, `date -j`, and a hard-coded Homebrew `PATH` tie the scripts to my laptop.

## Conclusion

None of this is sophisticated. It's yt-dlp, ffmpeg, whisper.cpp, rclone, and a static site generator held together with a few hundred lines of Bash. What made it work was a few rules applied everywhere:

- **One naming key** (`YYYY-MM-DD-slug`) shared by every artifact
- **Check for output before doing work**, so re-running is always safe
- **Never overwrite files a human might have edited**
- **Let the build validate the feed** through a typed schema

A podcast feed is really a promise to podcast apps that URLs and identities won't change. Most of the design, and most of what I'd fix, comes down to keeping that promise.
