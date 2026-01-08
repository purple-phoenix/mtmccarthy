# Deployment Guide

This guide covers deploying your Flask application to Render (recommended) and Vercel.

## 🎯 Recommendation: Render

**Render is the better choice for Flask applications** because:
- ✅ Designed for traditional web apps with persistent processes
- ✅ Minimal configuration required
- ✅ No code changes needed
- ✅ Better performance for Flask apps
- ✅ Free tier available with automatic SSL
- ✅ Easy database integration if needed later

## 🚀 Deploying to Render (Recommended)

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

### Step 4: Set Environment Variables (Optional)
If you need environment variables, add them in the Render dashboard:
- `SECRET_KEY`: Generate a secure key for production

### Step 5: Deploy
Click "Create Web Service" and Render will:
- Install dependencies
- Start your app
- Provide a URL like `https://your-app.onrender.com`

### Automatic Deployments
Render automatically deploys when you push to your main branch!

---

## 📦 Deploying to Vercel (Alternative)

**Note**: Vercel is serverless-first and less ideal for Flask apps. Use only if you prefer serverless architecture.

### Step 1: Install Vercel CLI
```bash
npm i -g vercel
```

### Step 2: Deploy
```bash
vercel
```

Follow the prompts, or deploy directly:
```bash
vercel --prod
```

### Step 3: Connect GitHub (Optional)
In the Vercel dashboard, you can connect your GitHub repo for automatic deployments.

### Limitations on Vercel
- Serverless functions have execution time limits
- Cold starts can cause slower initial requests
- File system writes may not persist between invocations
- Some Flask features may need adaptation

---

## 🔧 Configuration Files Explained

### `Procfile` (Render/Heroku)
Specifies the command to run your app. Render uses this or the Start Command you specify.

### `runtime.txt` (Render)
Specifies the Python version. Render will use Python 3.11.7.

### `vercel.json` (Vercel)
Configures Vercel to use the Python runtime for your Flask app.

### `requirements.txt`
Updated to include `gunicorn` which is needed for production deployment.

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

- [ ] Update `SECRET_KEY` in `app.py` or use environment variables
- [ ] Set `debug=False` in production
- [ ] Test all routes locally with gunicorn
- [ ] Verify static files load correctly
- [ ] Check that all blog posts and projects load
- [ ] Test on mobile devices

### Updating SECRET_KEY
For Render, set it as an environment variable in the dashboard.
For Vercel, add it in the project settings.

---

## 📊 Cost Comparison

### Render
- **Free Tier**: 750 hours/month (enough for always-on small apps)
- **Paid**: $7/month for starter plan (better performance)

### Vercel
- **Free Tier**: Generous for serverless functions
- **Paid**: Usage-based pricing

For traditional Flask apps, Render's free tier is usually sufficient.

---

## 🆘 Troubleshooting

### Render Issues
- **Build fails**: Check build logs in Render dashboard
- **App won't start**: Verify Start Command is correct
- **Static files not loading**: Ensure paths in templates are correct

### Vercel Issues
- **504 timeout**: Serverless functions have time limits
- **Import errors**: Check that all dependencies are in requirements.txt

---

## Need Help?

- Render Docs: https://render.com/docs
- Vercel Docs: https://vercel.com/docs
- Flask Deployment: https://flask.palletsprojects.com/en/latest/deploying/

