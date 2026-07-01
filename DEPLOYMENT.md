# Deployment Guide

This guide covers deploying your Flask application to Render.

## 🎯 Why Render

**Render is a good fit for Flask applications** because:
- ✅ Designed for traditional web apps with persistent processes
- ✅ Minimal configuration required
- ✅ No code changes needed
- ✅ Better performance for Flask apps
- ✅ Free tier available with automatic SSL
- ✅ Easy database integration if needed later

## 🚀 Deploying to Render

### Step 1: Prepare Your Repository
Ensure your code is pushed to GitHub, GitLab, or Bitbucket.

### Step 2: Create a Render Account
1. Go to [render.com](https://render.com)
2. Sign up with your GitHub account (recommended)

### Step 3: Create a Web Service
1. Click "New +" → "Web Service"
2. Connect your repository
3. Configure the service:
   - **Name**: Choose a name (e.g., `personal-website`)
   - **Region**: Choose closest to your audience
   - **Branch**: `main` (or your default branch)
   - **Root Directory**: Leave empty (or `.` if needed)
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app`
   - **Instance Type**: Free (or paid for better performance)

### Step 4: Set Environment Variables
Add these in the Render dashboard:
- `SECRET_KEY` (required): Generate a secure key for production, e.g. `python -c 'import secrets; print(secrets.token_hex(32))'`

### Step 5: Deploy
Click "Create Web Service" and Render will:
- Install dependencies
- Start your app
- Provide a URL like `https://your-app.onrender.com`

### Automatic Deployments
Render automatically deploys when you push to your main branch!

---

## 🔧 Configuration Files Explained

### `requirements.txt`
Lists the Python dependencies, including `gunicorn` which is needed for production deployment. This is the only deployment configuration file in the repo — the run command and Python version are configured in the Render dashboard (see the Start Command above), so no `Procfile` or `runtime.txt` is needed.

---

## 🛠️ Local Testing Before Deploy

Test your app locally with gunicorn:

```bash
pip install gunicorn
gunicorn app:app
```

Visit `http://localhost:8000` to verify everything works.

---

## 🔒 Production Checklist

Before deploying to production:

- [ ] Set the `SECRET_KEY` environment variable (the app refuses to start in production without it)
- [ ] Set `debug=False` in production
- [ ] Test all routes locally with gunicorn
- [ ] Verify static files load correctly
- [ ] Check that all blog posts and projects load
- [ ] Test on mobile devices

### Updating SECRET_KEY
For Render, set it as an environment variable in the dashboard.

---

## 📊 Cost

### Render
- **Free Tier**: 750 hours/month (enough for always-on small apps)
- **Paid**: $7/month for starter plan (better performance)

For traditional Flask apps, Render's free tier is usually sufficient.

---

## 🆘 Troubleshooting

### Render Issues
- **Build fails**: Check build logs in Render dashboard
- **App won't start**: Verify Start Command is correct
- **Static files not loading**: Ensure paths in templates are correct

---

## Need Help?

- Render Docs: https://render.com/docs
- Flask Deployment: https://flask.palletsprojects.com/en/latest/deploying/

