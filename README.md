# Godseye 👁️

Fleet monitoring system for Ubuntu servers with zero-touch deployment.

## Overview

**Godseye** is a lightweight, secure fleet monitoring system that provides real-time visibility into your Ubuntu servers. Agents auto-register with a single command and send metrics directly to Supabase every 5 minutes.

### Key Features

- ✅ **Zero-touch enrollment** - One command to register servers
- 🔒 **Secure by default** - HMAC signatures, JWT auth, replay protection
- ⚡ **Real-time dashboard** - Live updates via Supabase Realtime
- 📊 **Time-series analytics** - Efficient rollups for historical data
- 🚨 **Smart alerting** - Offline detection, disk usage, high load, security updates
- 🏗️ **No infrastructure** - Everything runs on Supabase

### What Gets Monitored

- System identity (hostname, OS, kernel, CPU, memory)
- Heartbeats (uptime, load averages, CPU %, memory usage, swap)
- Disks (mount points, usage, inodes)
- Network interfaces (IPs, MACs, rx/tx bytes)
- Top 30 processes by CPU/memory
- Installed packages & available updates
- Lightweight logs (optional)

---

## Architecture

```
Python Agent (Ubuntu Server)
    ↓ HTTPS + gzip + HMAC
Supabase Edge Functions
    ↓
Supabase Postgres + Realtime
    ↓
Solid.js Web Dashboard
```

### Components

1. **Python Agent** - Runs via systemd timer every 5 minutes
2. **Supabase Database** - 14 tables with RLS, rollups, and indexes
3. **Edge Functions** - `/enroll`, `/ingest`, `/rotate`, `/health`
4. **Scheduled Jobs** - Offline detection, rollups, cleanup
5. **Web Dashboard** - Real-time fleet view, server details, alerts

---

## Quick Start

### Prerequisites

- Supabase account and project
- Ubuntu 20.04+ servers
- Supabase CLI: `npm install -g supabase`

### 1. Setup Database

All migrations are already applied! ✅

Tables created:
- Core: `orgs`, `users`, `servers`
- Metrics: `heartbeats`, `disks`, `network_ifaces`, `processes`
- Operational: `packages`, `updates`, `logs`, `alerts`, `api_nonces`
- Rollups: `heartbeats_rollup_1m`, `heartbeats_rollup_1h`

### 2. Create Organization & Enrollment Secret

```sql
-- Generate a random enrollment secret (save this!)
-- Example: use a password generator for 32+ chars

-- Hash and insert org
INSERT INTO orgs (name, enroll_secret_hash)
VALUES (
  'My Organization',
  encode(digest('your-secret-here-min-32-chars', 'sha256'), 'hex')
);
```

### 3. Deploy Edge Functions

```bash
cd supabase/functions

# Set secrets
supabase secrets set JWT_SECRET=$(openssl rand -hex 32)
supabase secrets set CRON_SECRET=$(openssl rand -hex 32)

# Deploy
supabase functions deploy enroll
supabase functions deploy ingest
supabase functions deploy rotate
supabase functions deploy health
supabase functions deploy offline-detector
supabase functions deploy rollup-builder
supabase functions deploy nonce-cleanup
```

### 4. Setup Scheduled Jobs

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Offline detector (every 5 minutes)
SELECT cron.schedule(
  'offline-detector',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url:='https://vwfzujkqfplmvyljoiki.supabase.co/functions/v1/offline-detector',
    headers:='{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb
  ) AS request_id;$$
);

-- Rollup builder (every 5 minutes)
SELECT cron.schedule(
  'rollup-builder',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url:='https://vwfzujkqfplmvyljoiki.supabase.co/functions/v1/rollup-builder',
    headers:='{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb
  ) AS request_id;$$
);

-- Nonce cleanup (every 15 minutes)
SELECT cron.schedule(
  'nonce-cleanup',
  '*/15 * * * *',
  $$SELECT net.http_post(
    url:='https://vwfzujkqfplmvyljoiki.supabase.co/functions/v1/nonce-cleanup',
    headers:='{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb
  ) AS request_id;$$
);
```

### 5. Install Agent on Servers

```bash
# On each Ubuntu server:
curl -fsSL https://your-domain/install.sh | sudo bash
sudo rms-agent enroll --org-secret your-secret-here-min-32-chars

# Agent will start collecting and sending metrics every 5 minutes
```

---

## Project Structure

```
godseye/
├── docs/
│   └── development_plan.md        # Full specification
├── supabase/
│   ├── config.toml                # Supabase config
│   └── functions/                 # Edge Functions
│       ├── _shared/               # Shared utilities
│       │   ├── schema.ts          # Zod validation schemas
│       │   ├── auth.ts            # JWT + HMAC utilities
│       │   ├── db.ts              # Database helpers
│       │   └── response.ts        # HTTP response helpers
│       ├── enroll/                # Agent enrollment
│       ├── ingest/                # Metrics ingestion
│       ├── rotate/                # JWT rotation
│       ├── health/                # Health check
│       ├── offline-detector/      # Scheduled: offline alerts
│       ├── rollup-builder/        # Scheduled: time-series rollups
│       └── nonce-cleanup/         # Scheduled: cleanup old nonces
├── agent/                         # Python agent (TODO)
├── web/                           # Solid.js dashboard (TODO)
└── README.md
```

---

## Security

- **Transport**: HTTPS only
- **Agent Auth**: Short-lived JWT (60 min) + HMAC-SHA256 signatures
- **Replay Protection**: Nonce cache with 5-minute window
- **Row-Level Security**: All data scoped by `org_id`
- **Secrets**: Per-agent HMAC secrets, refresh tokens stored securely
- **Rate Limiting**: Function-level rate limits (configure in Supabase)

---

## Development Status

### ✅ Completed
- [x] Database schema with RLS
- [x] All Edge Functions
- [x] Scheduled jobs (offline, rollups, cleanup)
- [x] Security layer (JWT, HMAC, nonces)

### 🚧 In Progress
- [ ] Python agent
- [ ] Web dashboard
- [ ] Installation script

### 📋 Planned
- [ ] Additional alerting rules (disk, load, updates)
- [ ] CSV/JSON export
- [ ] Multi-org admin panel
- [ ] SSO integration

---

## Documentation

- **Development Plan**: See `docs/development_plan.md` for full specification
- **Edge Functions**: See `supabase/functions/README.md`
- **Agent Setup**: Coming soon
- **Web Dashboard**: Coming soon

---

## License

MIT

---

## Support

For issues, questions, or contributions, please open an issue on GitHub.

