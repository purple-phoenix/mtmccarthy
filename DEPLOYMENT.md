# Deployment Guide

This guide covers deploying the Flask application to Vercel. Production moved from Render on 1 November 2026; the old Render service `mtmccarthy` is suspended and will be deleted later.

## 🎯 Why Vercel

The site uses the free **Hobby** plan in the Vercel project [`matt-mccarthys-projects/mtmccarthy`](https://vercel.com/matt-mccarthys-projects/mtmccarthy):
- ✅ Flask support with zero configuration
- ✅ Git-linked production and branch preview deployments
- ✅ Custom domains with automatic HTTPS
- ✅ Deployment history and rollback controls

## 🚀 Deploying to Vercel

### Step 1: Prepare Your Repository

The project is linked to [`purple-phoenix/mtmccarthy`](https://github.com/purple-phoenix/mtmccarthy). Work on a branch and open a PR; Matt merges. A push to `main` deploys to production, so do not merge or push to `main` without his explicit go-ahead.

### Step 2: Open the Vercel Project

Open [the project dashboard](https://vercel.com/matt-mccarthys-projects/mtmccarthy). The existing Git link handles deployments; there is no need to create another project.

### Step 3: Check the Framework Preset

In the project's **Settings → Build and Deployment**, use **Flask**, not **Other**. The Flask preset runs the `app` object in `app.py` and installs Python dependencies from `requirements.txt`. No `vercel.json` or gunicorn start command is needed.

The previous **Other** preset served only static files, causing every application page, including PR previews, to return 404. With **Flask**, production and previews render the application's pages.

### Step 4: Set Environment Variables

Manage variables in **Vercel → Project → Settings → Environment Variables**:
- `SECRET_KEY` (required): Already set as a **sensitive** variable for **Production + Preview**. To generate a replacement: `python -c 'import secrets; print(secrets.token_hex(32))'`. Never commit it.
- `GA_MEASUREMENT_ID` (optional, currently unset): Google Analytics measurement ID; analytics are omitted when unset.
- `SITE_URL` (optional, currently unset): Canonical origin for absolute URLs (canonicals, OG tags, sitemap, RSS feed). Defaults to `https://mattmccarthy.dev`; only set it if the intended canonical origin changes.

Deploy again after changing environment variables so the new deployment uses them.

### Step 5: Deploy and Check the Preview

Push your branch to GitHub. Vercel installs dependencies and builds a preview automatically. Find its URL in the PR's `vercel[bot]` comment or run `vercel ls` from a locally linked clone.

Previews use **Vercel Authentication**. Open the preview while signed in to Vercel, or use the logged-in CLI to check it:

```bash
vercel curl /resume --deployment <preview-url-or-id>
vercel curl / --deployment <preview-url-or-id>
vercel curl /sitemap.xml --deployment <preview-url-or-id>
```

Before opening a PR, request every sitemap `<loc>` path on that same preview and expect HTTP 200. The sitemap's absolute URLs use the canonical production origin, so replace the origin with the preview target rather than accidentally checking production. Link a representative page on the preview in the PR and include 2–4 numbered UI steps. For docs-only changes, explain that these steps confirm the preview builds and renders.

### Automatic Deployments

Pushes to `main` deploy to **production**. Other branches get **preview deployments**. A merge is therefore a production release, and Matt handles it.

### Domains and HTTPS

- **Primary**: `https://mattmccarthy.dev`
- **Redirect**: `https://www.mattmccarthy.dev` returns a 301 redirect to the apex domain.
- **DNS provider**: Porkbun. The apex **ALIAS** and `www` **CNAME** both point to `50ab36e2ded0a91c.vercel-dns-017.com`.
- **Certificate**: Vercel provisions HTTPS through Let's Encrypt.

After the migration, all 68 sitemap URLs returned HTTP 200 on production (verified 1 November 2026).

### Rolling Back

In **Vercel → Project → Deployments**, choose a known-good deployment and use **Promote** to make it production, or use **Instant Rollback** to restore the previous production deployment. Confirm the target before changing production, then check the home page and `/resume`. Rollback changes the served deployment; it does not revert Git commits, so fix or revert the branch before the next production push.

---

## 🔧 Configuration Files Explained

### `requirements.txt`

Lists the Python dependencies installed by Vercel's Flask preset. `gunicorn` remains listed but is no longer the production server. No `Procfile`, `runtime.txt`, or `vercel.json` is needed. `requirements-dev.txt` holds local and CI test dependencies, not production dependencies.

### `.vercel/`

Local project metadata created by `vercel link`. It is ignored by Git and must not be committed.

### `package.json` / `tailwind.config.js`

Dev-only toolchain for building the site's Tailwind CSS into the committed `static/css/main.css`. The Vercel Flask deployment serves this prebuilt file without a Node build. If you change Tailwind classes or `assets/css/tailwind.css`, rebuild and commit the stylesheet before deploying (`npm install && npm run build:css`).

---

## 🛠️ Local Testing Before Deploy

Install the dependencies in your virtual environment, then run the app on a spare port (`SECRET_KEY` is required when Flask imports the app):

```bash
pip install -r requirements.txt -r requirements-dev.txt
SECRET_KEY=dev-only-key flask --app app run --no-reload -p 8001
```

Visit `http://localhost:8001`. In another terminal using the same environment, run `pytest -m "not e2e"`. See the README's "Running Tests" section for the Playwright smoke tests. Check the deployed preview as well, using the commands above.

---

## 🔒 Production Checklist

Before deploying to production:

- [ ] Use the **Flask** Framework Preset
- [ ] Set sensitive `SECRET_KEY` for **Production + Preview**
- [ ] Keep debug mode off in production (Vercel imports `app`; it does not run the local `python app.py` debug server)
- [ ] Run the test suite and check CI is green
- [ ] Check every sitemap path returns 200 on the preview
- [ ] Verify static files load correctly
- [ ] If Tailwind classes or `assets/css/tailwind.css` changed, rebuild and commit `static/css/main.css` (`npm run build:css`)
- [ ] Verify `/sitemap.xml`, `/robots.txt`, and `/feed.xml` use the intended canonical origin
- [ ] Test on mobile devices
- [ ] Include the preview link and 2–4 numbered test steps in the PR; leave merging to Matt

### Updating SECRET_KEY

Update the sensitive variable for **Production + Preview** in **Settings → Environment Variables**, then deploy again. Existing deployments keep their previous environment values.

---

## 📊 Cost

### Vercel

The production project uses the free **Hobby** plan. Review usage in the Vercel dashboard before considering any paid upgrade.

---

## 🆘 Troubleshooting

### Vercel Issues

- **Every page returns 404**: Check that the Framework Preset is **Flask**, not **Other**, then redeploy.
- **Preview asks for sign-in**: This is Vercel Authentication. Sign in to Vercel or use `vercel curl <path> --deployment <url-or-id>` from a logged-in CLI.
- **Build fails**: Open the deployment's build logs and check `requirements.txt`.
- **App won't start**: Check runtime logs and verify `SECRET_KEY` is set for the deployment's environment.
- **Static files not loading**: Ensure paths in templates are correct and the compiled stylesheet is committed.
- **Custom domain or HTTPS fails**: Check **Settings → Domains** and the Porkbun DNS records above.

---

## Need Help?

- [Vercel Flask documentation](https://vercel.com/docs/frameworks/backend/flask)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel Instant Rollback](https://vercel.com/docs/instant-rollback)
- [Flask deployment documentation](https://flask.palletsprojects.com/en/stable/deploying/)
