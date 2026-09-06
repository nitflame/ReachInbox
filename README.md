# ReachInbox.ai Email Scheduler & Automation Platform

An enterprise-grade, distributed email scheduling and marketing automation platform built for the **ReachInbox.ai Software Development Intern Assignment**.

The platform features reliable, multi-tenant email campaign scheduling with BullMQ and Redis, distributed atomic hourly rate limiting and send pacing, real-time Slack notifications with atomic deduplication, full-text multi-field email indexing via Elasticsearch 8, Google OAuth 2.0 authentication, Bull Board queue monitoring, and a modern React 19 / Vite analytics dashboard alongside an interactive Anti-Gravity canvas.

---

## Table of Contents

1. [Overview](#overview)
2. [Key Features](#key-features)
3. [System Architecture](#system-architecture)
4. [Tech Stack](#tech-stack)
5. [Project Structure](#project-structure)
6. [Prerequisites](#prerequisites)
7. [Local Setup & Getting Started](#local-setup--getting-started)
8. [Environment Variables](#environment-variables)
9. [Infrastructure Setup (Docker)](#infrastructure-setup-docker)
   - [PostgreSQL Setup & Migrations](#postgresql-setup--migrations)
   - [Redis Setup](#redis-setup)
   - [Elasticsearch Setup](#elasticsearch-setup)
10. [Running the Application](#running-the-application)
    - [Running Backend API](#running-backend-api)
    - [Running BullMQ Worker](#running-bullmq-worker)
    - [Running Frontend UI](#running-frontend-ui)
11. [Queue Dashboard (Bull Board)](#queue-dashboard-bull-board)
12. [Google OAuth 2.0 Setup](#google-oauth-20-setup)
13. [Slack OAuth 2.0 & Notification Setup](#slack-oauth-20--notification-setup)
14. [Core Architectural Subsystems](#core-architectural-subsystems)
    - [Email Scheduling & Pacing](#email-scheduling--pacing)
    - [Hourly Rate Limiting & Atomic Lua Scripts](#hourly-rate-limiting--atomic-lua-scripts)
    - [Rate-Limit Rescheduling (Zero Retry Loss)](#rate-limit-rescheduling-zero-retry-loss)
    - [Slack Rate-Limit Notifications & Deduplication](#slack-rate-limit-notifications--deduplication)
    - [Idempotency & Replay Protection](#idempotency--replay-protection)
    - [Restart Persistence (BullMQ Redis Sorted Sets)](#restart-persistence-bullmq-redis-sorted-sets)
    - [Elasticsearch Indexing & Multi-Field Search](#elasticsearch-indexing--multi-field-search)
    - [Authentication & Multi-Tenant Data Isolation](#authentication--multi-tenant-data-isolation)
15. [Automated Testing & Verification](#automated-testing--verification)
16. [Recommended 5-Minute Demo Flow](#recommended-5-minute-demo-flow)
17. [Assignment Requirement Mapping](#assignment-requirement-mapping)
18. [Assumptions and Trade-offs](#assumptions-and-trade-offs)

---

## Overview

ReachInbox.ai Email Scheduler is designed to solve the challenges of high-volume outbound email automation:
- **Zero Job Loss**: Scheduled emails persist across worker and server restarts without cron polling or in-memory timers.
- **Strict Rate Protection**: Outbound sending is paced per sender, and strict hourly rate quotas are atomized in Redis via Lua scripts.
- **Intelligent Rescheduling**: When a rate limit is reached, jobs are postponed to the start of the next UTC hour window without triggering failed attempt retries.
- **Operational Visibility**: Senders receive real-time rate limit alerts in Slack with atomic Redis deduplication (1 alert per sender per hour).
- **Fast Search & Real Analytics**: Campaigns are indexed in Elasticsearch for sub-50ms search, while the dashboard delivers real-time PostgreSQL analytics.

---

## Key Features

- **Distributed Queue Processing**: BullMQ backed by Redis for delayed and immediate job execution.
- **Sender Pacing**: Automatic enforcement of `max(requestedDelay, 3600000 / hourlyLimit)` to prevent burst congestion.
- **Atomic Rate Limiter**: Redis Lua scripts track sent counts within dynamic UTC hour buckets (`YYYY-MM-DD:HH`).
- **Slack OAuth & Webhooks**: Seamless 1-click workspace connection; rate-limit alerts sent directly to chosen channels.
- **Idempotency Engine**: Cryptographic key deduplication prevents duplicate database records and duplicate deliveries upon network retry.
- **Elasticsearch Search**: Sub-second full-text searching across recipients, subject, and body text with status filters.
- **Multi-Tenant Security**: Data access strictly partitioned by user ID across SQL queries, search queries, and session stores.
- **Production Dashboard**: 4x KPI cards, interactive SVG activity charts, hourly quota gauges, and live event streams.

---

## System Architecture

```
+-----------------------------------------------------------------------------------+
|                              React 19 Frontend (Vite)                             |
|  - Modern SaaS Overview: KPIs, SVG Activity Chart, Quota Gauges, Event Feeds     |
|  - Search Bar: Real-time Elasticsearch queries via debounced API                 |
|  - Anti-Gravity Canvas: Interactive physics-based canvas with UCD anchor zones   |
+---------------------------------------+-------------------------------------------+
                                        | HTTP / JSON (Credentials: Include)
                                        v
+-----------------------------------------------------------------------------------+
|                            Express API Server (Port 4000)                         |
|  - Session Auth (Google OAuth & Dev Fallback)   - Rate Limit Enforcement Logic    |
|  - Email Scheduling & Idempotency Pipeline      - Elasticsearch Search Endpoints  |
|  - Bull Board Monitoring (/admin/queues)        - Slack OAuth Handshake & Status  |
+-------------------+--------------------+--------------------+---------------------+
                    |                    |                    |
                    v                    v                    v
            +---------------+    +---------------+    +---------------+
            |  PostgreSQL   |    |     Redis     |    | Elasticsearch |
            | (Source of    |    | - Sessions    |    | (Full-text    |
            |  Truth DB)    |    | - BullMQ Queue|    |  Search Index)|
            +---------------+    | - Lua Atomics |    +---------------+
                                 +-------+-------+
                                         |
                                         v
                                 +---------------+
                                 | BullMQ Worker |
                                 | - Pacing Gate |
                                 | - Rate Limiter|
                                 | - SMTP Sender |
                                 +-------+-------+
                                         |
                                         v
                                 +---------------+
                                 | Ethereal SMTP |
                                 | (Email Server)|
                                 +---------------+
```

---

## Tech Stack

- **Backend**: Node.js (v18+), TypeScript 5, Express 4, Zod validation
- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS, Lucide Icons
- **Database**: PostgreSQL 16 (Relational state & analytics)
- **Queues & Cache**: Redis 7, BullMQ 5, connect-redis
- **Search Engine**: Elasticsearch 8.11 (`@elastic/elasticsearch`)
- **Email Delivery**: Nodemailer with Ethereal SMTP test server
- **Integrations**: Google OAuth 2.0, Slack OAuth 2.0 & Incoming Webhooks
- **Monitoring**: Bull Board (`@bull-board/express`)
- **Testing**: Vitest, TypeScript compiler (`tsc`), Supertest-compatible E2E harness

---

## Project Structure

```
OUTBOX PROJECT/
├── .gitignore                     # Repository-wide ignore rules
├── README.md                      # Complete system documentation
├── backend/                       # Node.js + Express API & BullMQ Worker
│   ├── src/
│   │   ├── config/                # Environment, PostgreSQL, Redis, Elasticsearch, Bull Board
│   │   ├── controllers/           # HTTP handlers (auth, emails, slack)
│   │   ├── db/                    # Migrations and PostgreSQL connection pool
│   │   ├── middleware/            # Auth, dev-auth, session, error handling
│   │   ├── models/                # Database models (email, sender, user, slack, analytics)
│   │   ├── queues/                # BullMQ queue configuration
│   │   ├── routes/                # Express API routes
│   │   ├── services/              # Pacing, rateLimiter, slackNotifier, elasticsearch
│   │   ├── validation/            # Zod schemas for request validation
│   │   ├── workers/               # BullMQ worker execution loop
│   │   ├── app.ts                 # Express app assembly & CORS
│   │   ├── server.ts              # API server bootstrap & graceful shutdown
│   │   └── worker.ts              # Dedicated worker daemon entrypoint
│   ├── tests/                     # Comprehensive integrated end-to-end test suite
│   ├── docker-compose.yml         # Container definitions for Postgres, Redis, Elasticsearch
│   ├── .env.example               # Configuration template with zero secrets
│   ├── package.json               # Backend dependencies and scripts
│   └── tsconfig.json              # TypeScript compilation configuration
└── frontend/                      # React 19 + Vite Application
    ├── src/
    │   ├── api/                   # Typed API service client
    │   ├── components/            # UI components (Navbar, StatCard, Chart, ComposeModal)
    │   ├── context/               # AuthContext and EmailContext
    │   ├── pages/                 # DashboardOverview, AnalyticsTab, ScheduledTab, SentTab
    │   ├── physics/               # Anti-Gravity physics engine
    │   ├── types/                 # Shared TypeScript interfaces
    │   ├── App.tsx                # Application root
    │   └── main.tsx               # DOM entrypoint
    ├── package.json               # Frontend dependencies and scripts
    └── vite.config.ts             # Vite build configuration
```

---

## Prerequisites

- **Node.js**: v18.0.0 or higher (`node -v`)
- **npm**: v9.0.0 or higher (`npm -v`)
- **Docker & Docker Compose**: For running PostgreSQL, Redis, and Elasticsearch containers

---

## Local Setup & Getting Started

### 1. Clone the Repository
```bash
git clone https://github.com/nitflame/ReachInbox.git
cd ReachInbox
```

### 2. Start Infrastructure Containers
In the `backend/` directory, start the required background services:
```bash
cd backend
docker compose up -d
```
Verify that PostgreSQL (`5432`), Redis (`6379`), and Elasticsearch (`9200`) are running:
```bash
docker ps
```

### 3. Configure Backend Environment
Copy the example environment file:
```bash
cp .env.example .env
```
*(See the [Environment Variables](#environment-variables) section below to configure secrets).*

### 4. Install Dependencies & Run Database Migrations
```bash
# In backend/
npm install
npm run migrate
```

### 5. Install Frontend Dependencies
```bash
cd ../frontend
npm install
```

---

## Environment Variables

The backend configuration is managed in `backend/.env`. A complete, sanitized template is provided in `backend/.env.example`:

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | Application environment (`development` / `production`) |
| `PORT` | `4000` | Express API server port |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/reachinbox` | PostgreSQL connection URI |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URI |
| `ELASTICSEARCH_URL` | `http://localhost:9200` | Elasticsearch cluster endpoint |
| `DEFAULT_SEND_DELAY_MS` | `2000` | Minimum gap between outbound emails (ms) |
| `DEFAULT_HOURLY_LIMIT` | `100` | Default hourly quota per sender |
| `ENABLE_DEV_AUTH` | `true` | Allows local dev login bypass (`/api/auth/dev-login`) |
| `GOOGLE_CLIENT_ID` | `...` | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | `...` | Google OAuth 2.0 Client Secret |
| `GOOGLE_CALLBACK_URL` | `http://localhost:4000/api/auth/google/callback` | Google OAuth redirect URI |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin and redirect target |
| `SESSION_SECRET` | `reachinbox-dev-secret-do-not-use-in-production` | Secret for cookie signing |
| `SLACK_CLIENT_ID` | `...` | Slack App Client ID |
| `SLACK_CLIENT_SECRET` | `...` | Slack App Client Secret |
| `SLACK_CALLBACK_URL` | `http://localhost:4000/api/slack/callback` | Slack OAuth redirect URI |
| `SLACK_WEBHOOK_URL` | `...` | *(Optional)* Static fallback Slack Webhook URL |

---

## Infrastructure Setup (Docker)

The provided `backend/docker-compose.yml` launches all required services with persistent volumes:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: reachinbox
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.3
    ports: ["9200:9200"]
    environment:
      discovery.type: single-node
      xpack.security.enabled: "false"
```

### PostgreSQL Setup & Migrations
Database migrations are strictly versioned in SQL under `backend/src/db/migrations/`:
- `001_initial_schema.sql`: Core tables (`users`, `senders`, `emails`)
- `002_add_pacing_and_hourly_limits.sql`: Pacing configuration columns
- `003_pacing_and_idempotency.sql`: Idempotency keys and indexes
- `004_user_google_auth.sql`: Google OAuth profiles and avatars
- `005_slack_connections.sql`: Multi-tenant Slack OAuth tokens & webhooks

Execute all migrations:
```bash
cd backend
npm run migrate
```

---

## Running the Application

### 1. Running Backend API
```bash
cd backend
npm run dev
# or compile and run production dist:
npm run build
npm run start
```
The server will start on [http://localhost:4000](http://localhost:4000).

### 2. Running BullMQ Worker
In a separate terminal:
```bash
cd backend
npm run worker
```
The worker will listen on queue `email-send-queue` with concurrency `5`.

### 3. Running Frontend UI
In a separate terminal:
```bash
cd frontend
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Queue Dashboard (Bull Board)

ReachInbox includes a built-in Bull Board instance to monitor background queue metrics, delayed sets, active jobs, and retry counts:
- **URL**: [http://localhost:4000/admin/queues/](http://localhost:4000/admin/queues/)
- Protected by session authentication (requires active login).

---

## Google OAuth 2.0 Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Set **Authorized redirect URIs** to:
   ```text
   http://localhost:4000/api/auth/google/callback
   ```
4. Copy the Client ID and Secret into `backend/.env`.
5. *(Development Note)*: When `ENABLE_DEV_AUTH=true`, you can also authenticate instantly without Google credentials via `GET /api/auth/dev-login?email=user@example.com`.

---

## Slack OAuth 2.0 & Notification Setup

ReachInbox supports real multi-tenant Slack OAuth 2.0 as well as static webhook fallbacks:

### App Configuration in Slack Developer Console:
1. Create a new app at [api.slack.com/apps](https://api.slack.com/apps) (**From scratch**).
2. Under **OAuth & Permissions** &rarr; **Redirect URLs**, add:
   ```text
   http://localhost:4000/api/slack/callback
   ```
   *(Click "Save URLs")*.
3. Under **OAuth & Permissions** &rarr; **Bot Token Scopes**, add:
   * `chat:write`
   * `incoming-webhook`
4. Under **Basic Information**, copy **Client ID** and **Client Secret** into `backend/.env`:
   ```env
   SLACK_CLIENT_ID=your_client_id
   SLACK_CLIENT_SECRET=your_client_secret
   SLACK_CALLBACK_URL=http://localhost:4000/api/slack/callback
   ```
5. In the ReachInbox UI, click **Connect Slack** in the top navbar to authorize your channel.

---

## Core Architectural Subsystems

### Email Scheduling & Pacing
When scheduling a campaign via `POST /api/emails/schedule`:
1. The requested delay between emails is validated.
2. The system computes the **effective pacing delay**:
   $$\text{effectiveDelayMs} = \max\left(\text{requestedDelayMs}, \left\lceil \frac{3\,600\,000}{\text{hourlyLimit}} \right\rceil\right)$$
3. Each recipient receives an incremental scheduled time based on this formula, preventing immediate burst queue congestion.

### Hourly Rate Limiting & Atomic Lua Scripts
The BullMQ worker evaluates the sender's hourly limit immediately before dispatch:
- Keys are bucketed by sender and UTC hour: `rate-limit:{senderId}:{YYYY-MM-DD:HH}`.
- An atomic Redis Lua script checks the counter against `hourlyLimit` and increments it if capacity remains.
- If the limit has been reached, the script returns `0` along with the timestamp of the start of the next UTC hour (`nextHourStart`).

### Rate-Limit Rescheduling (Zero Retry Loss)
When rate-limited:
1. The worker moves the job back to the BullMQ delayed set using `job.moveToDelayed(nextHourStart)`.
2. The worker throws BullMQ's internal `DelayedError`.
3. **Crucial Advantage**: The job's retry attempts counter (`job.attemptsMade`) remains at `0`. Rate-limiting is treated as expected scheduling deferral, **never as a job failure**.

### Slack Rate-Limit Notifications & Deduplication
When a rate limit is triggered:
1. The worker invokes `notifyRateLimitReached()`.
2. **Atomic Deduplication**: An atomic Redis lock `slack-rate-limit-notified:{senderId}:{hourWindowKey}` is acquired using `SET NX` with a 3,700s TTL.
3. If acquired, the alert is sent via the user's connected Slack webhook or `chat.postMessage`.
4. If subsequent emails for the same sender hit the limit within the same hour window, the lock claim fails, **completely preventing channel spam**.
5. When the next UTC hour window begins, the key changes, allowing a fresh notification.

### Idempotency & Replay Protection
`POST /api/emails/schedule` accepts an optional `idempotencyKey`:
- Stored in PostgreSQL with unique indexing.
- Re-transmitting an identical request returns the original HTTP 201 response with `idempotentReplay: true`.
- Zero duplicate database rows and zero duplicate queue jobs are ever created.

### Restart Persistence (BullMQ Redis Sorted Sets)
- Future scheduled emails are stored in BullMQ's Redis sorted set (`bull:email-send-queue:delayed`).
- **No reliance on Node.js `setTimeout` or cron**.
- If the API server, worker, or machine restarts, all delayed jobs remain safely persisted in Redis.
- When the worker restarts, BullMQ reads the sorted set and promotes delayed jobs to active status as soon as their target timestamp matures.

### Elasticsearch Indexing & Multi-Field Search
- When emails are scheduled or transition states (`queued` &rarr; `processing` &rarr; `sent` &rarr; `failed`), the Elasticsearch document is updated in index `emails`.
- `GET /api/emails/search`: Performs multi-match full-text searches across `subject` and `body` with phrase matching on `recipient` and filter clauses for `status` and `user_id`.
- `POST /api/emails/reindex`: Administrative bulk sync endpoint that reindexes all PostgreSQL records into Elasticsearch.

### Authentication & Multi-Tenant Data Isolation
- Authentication is governed by Redis-backed session cookies (`reachinbox_sid`).
- Multi-tenancy is strictly enforced at the data layer:
  - SQL queries: `WHERE user_id = req.user.id`
  - Elasticsearch queries: `filter: [{ term: { user_id } }]`
  - Slack connections: Isolated by `user_id` foreign key.

---

## Automated Testing & Verification

The application includes comprehensive unit and end-to-end integration test suites:

### Running Unit Tests
```bash
cd backend
npm test
```
*Result*: **106 / 106 unit tests passed** (14 test suites covering pacing, rate limiters, schema validation, idempotency, Slack OAuth, and worker logic).

### Running Integrated End-to-End Tests
```bash
cd backend
npm run test:integrated
```
*Result*: **104 / 104 checks passed in 9.72s** across 13 live execution phases validating PostgreSQL, Redis, BullMQ, real Ethereal SMTP delivery, rate-limit deferral, Elasticsearch search, and multi-tenant isolation.

### Running TypeScript & Frontend Verification
```bash
# Backend TypeScript check:
cd backend
npm run typecheck   # (tsc --noEmit)
npm run build

# Frontend Build & Lint:
cd ../frontend
npm run build       # (tsc -b && vite build)
npm run lint        # (oxlint)
```

---

## Recommended 5-Minute Demo Flow

1. **Dashboard & Auth Overview (Minute 1)**:
   - Open [http://localhost:5173/](http://localhost:5173/).
   - View authenticated profile, KPI summary cards (Total, Sent, Scheduled, Failed, Success Rate), and hourly quota card.
2. **Slack Connection (Minute 2)**:
   - Click **Connect Slack** in the top navbar &rarr; authorize your workspace & channel.
   - Show the green **Slack Connected** status indicator with your channel name.
3. **Compose & Batch Upload (Minute 3)**:
   - Click **Compose Email**.
   - Paste 3 test recipients (`lead1@test.com`, `lead2@test.com`, `lead3@test.com`).
   - Set **Hourly Limit**: `1`, **Delay**: `2 seconds`.
   - Click **Send Campaign**.
4. **Live Execution & Rate-Limit Rescheduling (Minute 4)**:
   - **Email 1**: Show immediate delivery via Ethereal SMTP (`sent`).
   - **Email 2**: Worker detects limit `1/hr` &rarr; automatically reschedules to the start of the next UTC hour.
   - **Slack Alert**: Open Slack and show the incoming Rate Limit Warning message.
   - **Anti-Spam Deduplication**: Email 3 is rescheduled without sending a duplicate alert.
5. **Search & Analytics (Minute 5)**:
   - Type a keyword into the top search bar &rarr; show instantaneous Elasticsearch results.
   - Switch to the **Analytics** tab &rarr; inspect the responsive SVG Activity Chart and Status Breakdown.

---

## Assignment Requirement Mapping

| Assignment Requirement | Architecture & Implementation | Primary Source File | Verification / Test Evidence |
| :--- | :--- | :--- | :--- |
| **Email Queue & Scheduling** | BullMQ queue with Redis delayed sets | [`backend/src/queues/email.queue.ts`](backend/src/queues/email.queue.ts) | Integrated Test Phase 5 (16 checks) |
| **Pacing Between Emails** | Enforces `max(delay, 3600000 / limit)` | [`backend/src/services/sendPacing.service.ts`](backend/src/services/sendPacing.service.ts) | Unit tests in `pacing.test.ts` (6 tests) |
| **Hourly Rate Limiting** | Atomic Redis Lua script per sender/hour | [`backend/src/services/rateLimiter.service.ts`](backend/src/services/rateLimiter.service.ts) | Integrated Test Phase 8 (5 checks) |
| **Rescheduling Without Retry Loss**| `DelayedError` preserves `attempts = 0` | [`backend/src/workers/email.worker.ts`](backend/src/workers/email.worker.ts) | Worker unit tests (`email.worker.test.ts`) |
| **Restart Persistence** | Redis delayed sets survive process restarts | BullMQ Redis sorted set design | Pre-submission QA Checklist 4 |
| **Real Email Delivery** | Nodemailer with Ethereal SMTP | [`backend/src/services/mailer.service.ts`](backend/src/services/mailer.service.ts) | Integrated Test Phase 7 (Real Ethereal send) |
| **Slack OAuth & Alerts** | Multi-tenant OAuth 2.0 & webhook dispatch | [`backend/src/services/slackNotifier.service.ts`](backend/src/services/slackNotifier.service.ts) | Integrated Test Phase 11 (6 checks) |
| **Notification Deduplication** | Atomic Redis `SET NX` (1 alert/sender/hr) | [`backend/src/services/slackNotifier.service.ts`](backend/src/services/slackNotifier.service.ts) | Unit tests in `slackNotifier.service.test.ts` |
| **Elasticsearch Search** | Multi-field full-text query with filters | [`backend/src/services/elasticsearch.service.ts`](backend/src/services/elasticsearch.service.ts) | Integrated Test Phase 9 (7 checks) |
| **Idempotency** | Replay deduplication via unique key index | [`backend/src/services/idempotency.service.ts`](backend/src/services/idempotency.service.ts) | Integrated Test Phase 6 (7 checks) |
| **Multi-Tenant Isolation** | Scoped queries by `req.user.id` | [`backend/src/controllers/emails.controller.ts`](backend/src/controllers/emails.controller.ts) | Integrated Test Phase 10 & 13 |
| **Modern UI & Analytics** | React 19, SVG activity charts, Zen Mode | [`frontend/src/pages/DashboardOverviewTab.tsx`](frontend/src/pages/DashboardOverviewTab.tsx) | Frontend build: 0 errors (752ms) |

---

## Assumptions and Trade-offs

1. **BullMQ over Cron**: We deliberately rejected `node-cron` or polling database intervals in favor of BullMQ Redis-backed delayed jobs. BullMQ guarantees that delayed jobs survive worker restarts without clock drift or polling overhead.
2. **Atomic Lua Scripts over Transactions**: Redis Lua scripts execute atomically on the single Redis thread, ensuring that concurrent workers checking rate limits cannot create race conditions.
3. **Strict Hourly Reset Boundaries**: Rather than arbitrary rolling 60-minute sliding windows, quotas align with standard UTC hour boundaries (`date_trunc('hour', NOW())`), enabling predictable batch scheduling and deterministic Slack notification deduplication.
4. **Non-Blocking Slack Side Effect**: Slack notifications are designed as asynchronous side effects. A network timeout or failure talking to Slack is caught safely and logged without failing or delaying the core email pipeline.
5. **Zero-Dependency SVG Charts**: The frontend Sending Activity chart was built directly in SVG rather than bringing in heavy external charting packages, eliminating version conflicts with React 19 while achieving instant render performance.
