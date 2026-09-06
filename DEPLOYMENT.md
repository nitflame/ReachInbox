# ReachInbox Cloud Deployment Guide

This guide describes how to deploy ReachInbox to production on **Render** or **Railway** in under 5 minutes.

---

## Option 1: Render (Recommended — Blueprint 1-Click)

The repository contains a `render.yaml` blueprint that provisions the Database, Backend API, Worker, and Frontend together.

### Step 1: Push & Connect on Render
1. Go to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** -> **Blueprint**.
3. Connect your GitHub repository: `nitflame/ReachInbox`.
4. Render will parse `render.yaml` and display:
   - **reachinbox-db** (PostgreSQL)
   - **reachinbox-backend** (Web Service)
   - **reachinbox-worker** (Background Worker)
   - **reachinbox-frontend** (Static Site)

### Step 2: Configure Environment Variables
In the Render setup screen, provide:
- **`REDIS_URL`**:
  - You can use a free Redis instance from [Upstash](https://upstash.com) (copy the Redis connection string `rediss://...`) or Render Redis.
- **`FRONTEND_URL`**: `https://<your-frontend-subdomain>.onrender.com`
- **`VITE_API_URL`** (in frontend service): `https://<your-backend-subdomain>.onrender.com`
- **`ENABLE_DEV_AUTH`**: `true` (allows instant 1-click login and demoing)
- **`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`**: (Optional if `ENABLE_DEV_AUTH=true`, or your Google OAuth credentials)
- **`SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`**: Your Slack OAuth credentials.

### Step 3: Deploy
Click **Apply**. Render will build and deploy all services. Your live URL will be:
`https://reachinbox-frontend.onrender.com`

---

## Option 2: Railway (Alternative)

1. Go to [Railway Dashboard](https://railway.app).
2. Click **New Project** -> **Deploy from GitHub repo** -> select `nitflame/ReachInbox`.
3. Add a **PostgreSQL** database and a **Redis** database via the `+ New` button.
4. Set the environment variables linking to the provisioned Postgres and Redis.
5. Deploy `backend` and `frontend`.

---

## Option 3: Docker Compose (Any VPS / Cloud VM)

Run the entire production stack locally or on an EC2 / DigitalOcean Droplet:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```
Access the application at `http://<server-ip>`.
