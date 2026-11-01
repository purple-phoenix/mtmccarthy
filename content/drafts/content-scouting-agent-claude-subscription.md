---
title: "A Personal Content-Scouting Agent on a Claude Subscription"
date: "2026-10-31"
category: "AI & Machine Learning"
excerpt: "How I built Muse, a small daily pipeline that finds, reads, and filters videos and essays for me by running the Claude Code CLI headlessly on my Claude subscription instead of an API key."
read_time: "9"
---

Most of what I learn from comes from long-form video, essays, and papers. The problem is not a lack of good material. It is that finding it means wading through recommendation feeds built to maximise watch time, and a forty-minute video can turn out to be five minutes of substance and thirty-five of filler.

So I built **Muse**: a set of small agents that run once a day, go looking for things worth my time, actually read or transcribe each one before recommending it, and leave me a short queue with notes. This post covers how it is put together, why it runs on my Claude subscription rather than an API key, and what I would change.

## The Problem

I wanted three things a recommendation feed does not give me:

1. **Judgement after reading, not before**: a title and thumbnail tell you almost nothing. I wanted every recommendation to be based on the full transcript or article text.
2. **A small, opinionated queue**: a handful of items a day, not an infinite scroll.
3. **Notes I keep**: a markdown knowledge base I can search later, independent of any platform.

The interests themselves live in a plain-English `profile.md` that I edit by hand. Every agent prompt gets that profile, so changing what Muse looks for is a text edit, not a code change.

## The Pipeline

A run is four stages: gather, judge, read, and output.

```
       profile.md + learned profile + liked/disliked titles
                              |
        +---------------------+----------------------+
        |                     |                      |
   plan (Claude)        channel RSS feeds      scout (Claude +
   writes ~8 YouTube    for followed           WebSearch/WebFetch)
   search queries       channels               finds articles/papers
        |                     |                      |
   yt-dlp search              |                      |
        +---------------------+----------------------+
                              |
                skip anything already in SQLite
                              |
          judge (Claude, metadata only, batches of 40)
          score >= 7 -> candidate, else rejected (both recorded)
                              |
               pick the top 8, at most 6 of one kind
                              |
      read: captions -> local Whisper fallback, or article text
                              |
       summarize (Claude, full content) -> verdict >= 7 to keep
                              |
         markdown notes  +  Queue.md  +  small web feed
```

### Gather

Three sources run concurrently in a thread pool:

- **Planned searches**: Claude writes eight YouTube search queries from the profile. The prompt asks for at least five distinct interest areas, about 20% exploratory queries on adjacent topics, and specific names and concepts rather than generic terms. `yt-dlp` runs each query and drops live and upcoming streams and Shorts.
- **Followed channels**: each channel in a `channels.json` file is checked through YouTube's public RSS feed for uploads from the last ten days. No API key is involved.
- **Web scout**: a separate Claude call with the `WebSearch` and `WebFetch` tools looks for essays, blog posts, and papers. The prompt asks it to confirm each URL loads, prefer canonical sources, and avoid paywalls and abstract-only pages.

Anything already in the database, or any video known to be under four minutes, is discarded before it reaches the judge.

### Judge

The judge scores every new candidate from 0 to 10 using only metadata: title, source, length, view count, and a short snippet. The prompt is deliberately strict: "in a typical batch most candidates should score below 7." It also tells the model to penalise near-duplicates, including the same speaker giving similar talks.

The key design choice here is that **every judged candidate is recorded, including rejections**. That is what stops Muse from spending calls re-evaluating the same video every morning.

```python
def judge_all(cfg: Config, conn, profile: str, feedback: dict, cands: list[dict]) -> None:
    """Score candidates and record every one, so nothing gets judged twice."""
    for i in range(0, len(cands), 40):
        batch = cands[i:i + 40]
        try:
            scores = agents.judge(profile, feedback, batch, cfg.model("judge"))
        except Exception as e:
            log.warning("judge batch failed, will retry next run: %s", e)
            continue
        for c in batch:
            s = scores.get(c["id"])
            if s is None:
                continue
            passed = s["score"] >= cfg.run["min_judge_score"]
            db.insert(conn, {**c, "status": "candidate" if passed else "rejected",
                             "score": s["score"], "reason": s["reason"]})
```

A failed batch is simply not written, so those candidates come back next run.

### Read

Passing candidates go into a pool, and each run picks the eight highest-scoring ones, capped at six of any one kind so a run is never all videos or all articles. Leftovers from earlier runs stay in the pool.

For videos, Muse pulls English captions through `yt-dlp`, preferring human captions over auto-generated ones and collapsing the rolling repeats that auto-captions produce. If there are no captions, or YouTube rate-limits the caption endpoint, it downloads the audio into a temporary directory, transcribes it locally with `mlx-whisper`, and the audio is deleted with the directory. For articles, `trafilatura` extracts the main text, and anything under 3,000 characters is treated as a stub or paywall. arXiv PDF links are rewritten to the HTML rendering because the PDFs do not extract well.

Then Claude reads the whole thing. The summarize prompt asks it first to decide whether the content "lives up to its title" and give an honest 0-10 verdict, then write notes: why I should spend time on it, how to consume it, a TL;DR, key ideas, timestamped highlights, and tags. My favourite field is `how`, whose schema description gives examples like "Watch 12:30-41:00, skip the rest" or "Notes are enough". Anything with a verdict under 7 is rejected even though it passed the metadata judge. That second filter is where clickbait gets caught.

### Output

Kept items become one markdown note each, with YAML frontmatter, sorted into `Videos/` and `Articles/` folders, so the library opens cleanly in Obsidian. A plain `Queue.md` lists what is unwatched. A small web app built on Python's standard-library `http.server` shows the queue as cards with thumbs up, thumbs down, and "mark done" buttons.

Those buttons close the loop. The 25 most recent liked and disliked titles are injected into the next run's prompts, and the 60 most recent queued titles go to the planner so it does not retread them.

## How Claude Is Invoked

All LLM calls go through one function, `llm.ask`, which shells out to the Claude Code CLI in print mode. There is no Anthropic SDK and no API key in the project.

```python
def ask(
    prompt: str,
    *,
    model: str = "sonnet",
    system: str = "You are a careful research assistant. Follow the instructions exactly.",
    schema: dict | None = None,
    tools: tuple[str, ...] = (),
    timeout: int = 900,
):
    cmd = [
        "claude", "-p",
        "--model", model,
        "--system-prompt", system,
        "--strict-mcp-config",
        "--no-session-persistence",
        "--output-format", "json",
        "--tools", ",".join(tools) if tools else "",
    ]
    if tools:
        cmd += ["--allowedTools", ",".join(tools)]
    if schema:
        cmd += ["--json-schema", json.dumps(schema)]

    # Drop the vars that tie us to a parent Claude Code session (when launched from one); keep auth.
    env = {
        k: v for k, v in os.environ.items()
        if not k.startswith("CLAUDE") or "OAUTH" in k or "API_KEY" in k
    }
    if "CLAUDE_CODE_OAUTH_TOKEN" not in env and TOKEN_FILE.is_file():
        env["CLAUDE_CODE_OAUTH_TOKEN"] = TOKEN_FILE.read_text().strip()
    with tempfile.TemporaryDirectory(prefix="muse-") as cwd:  # empty cwd: no stray CLAUDE.md
        try:
            proc = subprocess.run(
                cmd, input=prompt, capture_output=True, text=True, timeout=timeout, cwd=cwd, env=env
            )
        # ...
    try:
        out = json.loads(proc.stdout)
    # ...
    if out.get("is_error"):
        raise LLMError(f"claude error: {out.get('result')}")
    if schema:
        # ...
        return out["structured_output"]
    return out.get("result", "")
```

A few details matter more than they look:

- **`--system-prompt` replaces the default** instead of appending to it, and `--strict-mcp-config` keeps my MCP servers out of the call. Together they keep each call's fixed overhead to roughly 2.5k tokens instead of the full interactive harness.
- **The tool list is always explicit.** Only the web scout gets tools (`WebSearch` and `WebFetch`, also passed to `--allowedTools`). Every other role gets an empty `--tools` value.
- **The working directory is an empty temp folder**, so no project `CLAUDE.md` leaks into the context, and `--no-session-persistence` means daily runs do not pile up saved sessions.
- **Structured output comes from `--json-schema`.** Every role defines a JSON Schema in Python, and the parsed result is read from the `structured_output` field of the CLI's JSON response. No regex parsing of model prose.

Each role picks a model alias from `config.toml`. Planning, scouting, judging, and summarizing use `sonnet`. The one heavier job, distilling an optional YouTube watch-history export into a learned profile and a list of channels to follow, uses `opus`.

## Dedup and State

State is one SQLite table, `items`, keyed by a stable ID: `yt:<video id>` for videos and `web:<hash>` for articles. The article ID is the first 12 hex characters of a SHA-1 of a normalised URL.

```python
def normalize(url: str) -> str:
    p = urlsplit(url.strip())
    query = "&".join(q for q in p.query.split("&") if q and not q.startswith(("utm_", "ref=", "fbclid")))
    return urlunsplit((p.scheme.lower(), p.netloc.lower().removeprefix("www."), p.path.rstrip("/"), query, ""))


def item_id(url: str) -> str:
    return "web:" + hashlib.sha1(normalize(url).encode()).hexdigest()[:12]
```

Each row has a `status` of `candidate`, `rejected`, `queued`, or `failed`, plus the judge's `score`, the post-reading `verdict`, my `feedback`, and a `done` flag. Note paths are stored relative to the library so the database moves between machines.

Transient YouTube errors get **exactly one retry**: the first failure leaves the item as a candidate with an error recorded, and a second failure marks it `failed`. The caption fetcher also spaces requests four seconds apart across worker threads and backs off on HTTP 429.

## Scheduling

Muse runs on an always-on Mac mini. A deploy script syncs the code (never the data), upgrades dependencies, runs the tests, and installs two LaunchAgents: a daily run at 05:30 and an always-on feed server. The feed binds to localhost and is exposed only on my private Tailscale network with `tailscale serve`, never to the public internet. A run takes roughly 5-15 minutes.

## Subscription vs API

Running on a subscription instead of an API key was the point, but it comes with trade-offs.

**Cost is predictable.** Muse uses the plan I already pay for. There is no per-token bill to watch, and no API key to store.

**Headless auth was the hardest part.** The interactive login worked when I ran Muse by hand, but went stale under launchd with "OAuth session expired". The fix is a long-lived token from `claude setup-token`, stored in a mode-600 file outside the repo and passed to the CLI as `CLAUDE_CODE_OAUTH_TOKEN`. The env filter above also strips the other `CLAUDE*` variables, so a run launched from inside a Claude Code session does not inherit that session's state.

**Usage is shared and bounded.** A subscription has usage limits shared with my own interactive use, so I kept the call count small and fixed. A daily run makes one planning call, one scouting call, one judge call per 40 candidates, and at most eight summarize calls. The only call with tools is the scout.

**Staying sensible.** This is a single-user tool that runs once a day for my own reading. It talks to Claude only through the official CLI, authenticates with the CLI's own `claude setup-token` command, and never handles a password or scrapes credentials.

## What I'd Do Differently

- **Treat Claude errors as transient.** YouTube errors get one retry, but an `LLMError` during summarizing, whether a timeout or an error result, falls into the generic exception handler and marks the item `failed` for good. A usage-limit hit mid-run would quietly discard good candidates. The planner call is also the one LLM call in `gather` without a `try`, so if it fails the whole run stops. The same `_retry_or_fail` path should cover Claude-side failures.
- **Enforce variety structurally.** An early run skewed heavily toward one research topic, and the fix so far has been prompt wording in the planner and judge. The only structural diversity control is the per-kind cap. A per-topic or per-source cap in `pick` would be more reliable than asking nicely.
- **Richer feedback.** The taste signal is just the titles and sources of the last 25 liked and disliked items. It cannot say *why* I liked something, and the notes and tags Claude already wrote are not used.
- **Test the LLM boundary.** The tests cover caption parsing, URL normalisation, the retry rule, and note filename and duration formatting, but nothing exercises `llm.ask` or the prompts. A fake `claude` binary returning canned JSON would catch schema drift cheaply.
- **Push, don't wait to be pulled.** A digest notification, podcasts, and search in the feed are all on the ideas list and not built. Right now I have to remember to open the feed.

## Conclusion

The thing I would take from Muse into other projects is the shape: **cheap filters first, expensive reading last, and record every decision** so nothing is paid for twice. Metadata judging is fast and wrong often enough that a second, content-based verdict is essential, and that second pass is only affordable because the first one cut most of the field.

Running it through the Claude Code CLI on a subscription turned out to be a good fit for a personal tool. A replaced system prompt, an explicit tool list, an empty working directory, and a JSON Schema per role made each call small, predictable, and easy to parse. The remaining work is mostly about failing more gracefully when the model side has a bad morning.
