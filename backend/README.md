# ReachInbox Email Automation Platform

TypeScript + Express + PostgreSQL + Redis + BullMQ + Nodemailer/Ethereal + Elasticsearch + Bull Board + Google OAuth 2.0 + Slack OAuth 2.0 + React Frontend.

Covers:
* **B1**: Project foundation & architecture
* **B2**: Core email-scheduling pipeline
* **B3**: Distributed pacing, hourly rate limiting, rescheduling & idempotency
* **B4**: Elasticsearch email search & Bull Board queue dashboard (`/admin/queues`)
* **B5**: Real Google OAuth 2.0 authentication, Redis-backed sessions, and strict per-user email isolation
* **B6**: Real Slack OAuth 2.0 integration & rate-limit notifications
* **B7**: Full React frontend integration (`localhost:3000` / `localhost:5173`)

---

## 1. Stack & Architecture Summary

```
                      +-----------------------------+
                      | React Frontend (Vite)       |
                      | http://localhost:3000       |
                      +--------------+--------------+
                                     | (credentials: include)
                                     v
                      +-----------------------------+
                      | Express API Server          |
                      | http://localhost:4000       |
                      +------+---------------+------+
                             |               |
              +--------------+               +--------------+
              v                                             v
     +-----------------+                           +-------------------+
     | PostgreSQL      |                           | Redis Cache &     |
     | (Source of      |                           | Session Store     |
     |  Truth)         |                           +---------+---------+
     +-----------------+                                     |
                                                             v
     +-----------------+                           +-------------------+
     | Elasticsearch   |                           | BullMQ Queue      |
     | (Search Index)  |                           +---------+---------+
     +-----------------+                                     |
                                                             v
                                                   +-------------------+
                                                   | Email Worker      |
                                                   | (Nodemailer +     |
                                                   |  Pacing/Limiting) |
                                                   +-------------------+
```

Both the API and the worker are separate processes/entrypoints (`src/server.ts` / `src/worker.ts`) so API latency is never coupled to send throughput, and `WORKER_CONCURRENCY` and the number of worker processes can both be scaled independently.

---

## 2. Quick Setup & Run Instructions

### Prerequisites
- Node.js v18+
- Docker & Docker Compose (or local Postgres 15, Redis 7, Elasticsearch 8)

### Step-by-step Setup

```bash
# 1. Clone & install backend dependencies
cd backend
npm install

# 2. Configure environment variables
cp .env.example .env

# 3. Start infrastructure (PostgreSQL, Redis, Elasticsearch)
docker compose up -d

# 4. Apply database migrations (001 through 005)
npm run migrate

# 5. Start API server in development mode (Port 4000)
npm run dev

# 6. Start Email Worker process (separate terminal)
npm run worker:dev

# 7. Start React Frontend (separate terminal inside frontend directory)
cd ../frontend
npm install
npm run dev
```

---

## 3. Environment Variables

Reference `.env.example` for all configurable variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `4000` | API Server port |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/reachinbox` | PostgreSQL connection URI |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URI |
| `ELASTICSEARCH_URL` | `http://localhost:9200` | Elasticsearch node URI |
| `GOOGLE_CLIENT_ID` | *Your Google OAuth ID* | Google Cloud OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | *Your Google OAuth Secret* | Google Cloud OAuth 2.0 Client Secret |
| `GOOGLE_CALLBACK_URL` | `http://localhost:4000/api/auth/google/callback` | OAuth redirect URI |
| `SLACK_CLIENT_ID` | *Your Slack App ID* | Slack App Client ID |
| `SLACK_CLIENT_SECRET` | *Your Slack App Secret* | Slack App Client Secret |
| `SLACK_CALLBACK_URL` | `http://localhost:4000/api/slack/callback` | Slack OAuth callback URL |
| `FRONTEND_URL` | `http://localhost:3000` | Frontend web URL for CORS and OAuth redirects |
| `SESSION_SECRET` | `reachinbox-dev-secret...` | Secret key for express-session cookie encryption |
| `WORKER_CONCURRENCY` | `5` | BullMQ worker concurrent jobs per worker process |
| `DEFAULT_SEND_DELAY_MS` | `2000` | Minimum gap enforced between sends per sender |
| `DEFAULT_HOURLY_LIMIT` | `100` | Default hourly send cap per sender |
| `ENABLE_DEV_AUTH` | `false` | Fallback dev header auth (`X-Dev-User-Email`) |

---

## 4. Key Subsystem Specifications

### A. Distributed Pacing & Hourly Rate Limiting (B3)
* **Pacing**: Enforced via atomic Lua script `services/sendPacing.service.ts` (`email-pacing:{senderId}`). Guarantees minimum spacing between emails for the same sender across concurrent workers. Delayed jobs reschedule via `moveToDelayed` without incrementing retry attempt counters.
* **Hourly Rate Limiting**: Enforced via atomic Lua script `services/rateLimiter.service.ts` (`email-rate:{senderId}:{hourWindow}`) evaluated against the actual current UTC hour immediately before send. If pacing pushes a job across an hour boundary, the new hour's fresh quota is evaluated. Excess jobs reschedule to the start of the next UTC hour window without duplicating rows or jobs.
* **Idempotency**: Enforced via composite DB constraint `(user_id, idempotency_key)` and deterministic BullMQ job IDs (`sha256(batchKey :: recipient)`). Re-enqueuing duplicate batches is a safe no-op.

### B. Elasticsearch Search & Bull Board (B4)
* **Elasticsearch**: Emails indexed at schedule and update time. Search endpoint `GET /api/emails/search` provides multi-field matching (subject, body, recipient, status). PostgreSQL remains source-of-truth; ES failures fall back gracefully.
* **Bull Board UI**: Accessible at `/admin/queues`, protected by authentication. Displays real-time queue states (delayed, active, completed, failed).

### C. Authentication & Per-User Data Isolation (B5)
* Real Google OAuth 2.0 Authorization Code flow (`GET /api/auth/google`, `GET /api/auth/google/callback`).
* CSRF protection via server-side session `oauthState`.
* User sessions managed in Redis via `connect-redis` (`reachinbox_sid` cookie).
* All user endpoints strictly filter by `req.user.id`.

### D. Slack Notifications (B6)
* Real Slack OAuth 2.0 integration (`GET /api/slack/connect`, `GET /api/slack/callback`).
* Atomic hourly deduplication (`slack-rate-limit-notified:{senderId}:{hourWindow}`) ensures exactly one alert per sender/hour when hourly rate limit is reached.
* Safe disconnect & status endpoints (`GET /api/slack/status`, `POST /api/slack/disconnect`). Access tokens are never exposed.

### E. React Frontend Integration (B7)
* Vite React single-page application connected to backend REST APIs using `credentials: include`.
* Real-time search with debouncing, recipient batch upload (CSV parsing), compose modal with configurable pacing/limits, and Slack integration controls.

---

## 5. Requirement Mapping Table

| Requirement | Implementation Status | Evidence / Verification |
|-------------|-----------------------|-------------------------|
| **B1 Core Engine** | PASS | Modular Node/TypeScript codebase, health check (`GET /health`), clean separation of API & Worker processes. |
| **B2 Scheduling** | PASS | `POST /api/emails/schedule` supporting recipient lists, custom delay, and start time. |
| **B3 Pacing & Limits** | PASS | Atomic Redis Lua scripts (`reserveNextSlot`, `incrIfUnderLimit`), unit test suite 100% passing (15 tests). |
| **B3 Rescheduling** | PASS | BullMQ `moveToDelayed` with `DelayedError` preserving attempts counter; no infinite loops or duplicate rows. |
| **B4 Search Index** | PASS | Elasticsearch client with failover protection; full search support for recipient, subject, status. |
| **B4 Bull Board** | PASS | Mounted at `/admin/queues` with session-based authentication protection. |
| **B5 Google OAuth** | PASS (Mocks verified) | OAuth 2.0 authorization code flow, CSRF state verification, Redis session store. Live Google test optional with credentials. |
| **B5 User Isolation** | PASS | Strict `req.user.id` checks across all DB and ES query handlers. Client-supplied `userId` parameters ignored. |
| **B6 Slack OAuth** | PASS (Mocks verified) | Server-side OAuth flow, atomic notification deduplication per hour window. Live Slack test optional with credentials. |
| **B7 React Frontend** | PASS | Full SPA communicating via REST API with cookie credentials. |
| **Restart Persistence**| PASS | Postgres DB & Redis BullMQ queue persist scheduled state across process restarts. |

---

## 6. Concise 5-Minute Demo Script

Follow this script for a complete 5-minute project demonstration:

1. **Start Services (1 min)**:
   - Run `docker compose up -d` (Postgres, Redis, Elasticsearch).
   - Run `npm run migrate` in `backend/`.
   - Run `npm run dev` in `backend/` (API Server on port 4000).
   - Run `npm run worker:dev` in `backend/` (Email Worker).
   - Run `npm run dev` in `frontend/` (React UI on port 3000).

2. **Authentication (30 sec)**:
   - Open `http://localhost:3000` in browser.
   - Click "Sign in with Google" to complete OAuth flow (or use `ENABLE_DEV_AUTH=true` fallback header for local dev).
   - Verify dashboard header displays logged-in user name, email, and avatar.

3. **Compose & Upload (1 min)**:
   - Click "Compose Email".
   - Upload a sample CSV recipient list (`recipients.csv`).
   - Enter Subject, Body, Start Time (e.g. 10 seconds in future), Pacing Delay (2000ms), and Hourly Limit (2).
   - Click "Schedule Campaign".

4. **Scheduled Tab & Search (1 min)**:
   - Navigate to "Scheduled Emails" tab.
   - Type subject or recipient keyword in search bar; observe instant Elasticsearch search filter updates.
   - Observe worker terminal processing jobs sequentially with 2000ms pacing delay.

5. **Sent Tab & Ethereal Inbox (30 sec)**:
   - Navigate to "Sent Emails" tab to confirm updated status.
   - Check worker console log for Ethereal test preview URLs to view delivered emails.

6. **Bull Board & Slack (30 sec)**:
   - Open `http://localhost:4000/admin/queues` to inspect BullMQ jobs in active/completed/delayed states.
   - Demonstrate Slack connection in UI settings.

---

## 7. Known Limitations & Trade-offs

* **Live OAuth Verification**: Automated test suite uses mocked OAuth tokens and profiles to maintain fast CI test runs. Real Google/Slack OAuth testing requires registering local callback URLs in respective developer consoles.
* **SMTP Transport**: Default configuration uses Nodemailer auto-created Ethereal test accounts; production deployment requires providing standard SMTP credentials.

