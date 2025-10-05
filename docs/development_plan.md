Resource Management System — Full Development Document

Stack overview: Ubuntu hosts run a lightweight Python agent on a 5‑minute schedule. The agent enrolls and sends data directly to Supabase via Edge Functions (no self‑hosted API). Supabase (Postgres + Realtime + Storage + Edge Functions + Scheduled Functions) stores normalized data with RLS. A Solid.js + Tailwind web app (or Next.js) authenticates with Supabase and renders real‑time fleet views, server details, charts, and alerts. Optional scheduled jobs compute rollups and retention.

⸻

1) Goals & Non‑Goals

Goals (v1‑v2)
	•	Zero‑touch fleet visibility: new servers auto‑register via one command.
	•	Essentials only: identity, heartbeat (uptime, load, CPU, mem), disks, net, updates, top processes, light logs.
	•	Secure by default: short‑lived agent JWT, HMAC signing, strict RLS.
	•	Real‑time UI: Realtime subscriptions for fleet status and alerts.
	•	Time‑series graphs & rollups for efficient querying (phased).

Non‑Goals (v1)
	•	Remote command execution or SSH orchestration.
	•	Full log aggregation (terabytes/day). Keep logs lightweight or off by default.
	•	Sub‑minute sampling.

⸻

2) High‑Level Architecture
	•	Python Agent (Ubuntu): Collects facts + metrics; enrolls once; pushes JSON (gzip) every 5 minutes.
	•	Supabase Edge Functions: enroll, ingest, rotate, health. Validate payloads, enforce auth, upsert/insert.
	•	Postgres (Supabase): Normalized tables for servers, heartbeats, disks, network, processes, packages, updates, logs, alerts, rollups. RLS protects by org.
	•	Scheduled Functions / Queue: Offline detection, rollups (1m/5m/1h), retention pruning.
	•	Web App (Solid.js): Auth via Supabase; fleet list, server details, charts, search/filter, alerts.

Data flow
	1.	Enroll: Admin provides an ORG_ENROLL_SECRET. Agent calls enroll, receives agent_id, agent_jwt (short‑lived), and hmac_secret.
	2.	Ingest: Agent posts compressed JSON with HMAC + JWT. Edge Function validates, normalizes, writes.
	3.	Realtime: UI subscribes to changes on servers, heartbeats, alerts.
	4.	Scheduled jobs: compute rollups, mark offline, prune old rows.

⸻

3) Security Model
	•	Transport: HTTPS only.
	•	Agent auth: Short‑lived JWT (issued at enroll/rotate) + request HMAC signature using agent‑specific secret; headers X-Timestamp, X-Nonce, X-Signature (HMAC-SHA256 over canonical body + timestamp + nonce).
	•	Replay protection: 5‑minute skew; nonce cache in api_nonces table.
	•	RLS: All data rows are scoped by org_id. User sessions only read org_id = auth.jwt().org_id.
	•	Secrets: ORG_ENROLL_SECRET never leaves server except during enroll request; stored hashed. Agent stores agent_id, refresh token, hmac_secret in /etc/rms/credentials (0600 root:root).
	•	Rate limits: Function‑level (per agent, per IP). Payload size cap (e.g., 1–2 MB gzipped).

⸻

4) Data Model (DDL excerpts)

Primary keys use uuid (generated with gen_random_uuid()). Timestamps are timestamptz.

-- Orgs & Users (users managed by Supabase Auth; this table mirrors org membership)
create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  enroll_secret_hash text not null,
  created_at timestamptz default now()
);

create table public.users (
  id uuid primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner','admin','viewer')),
  created_at timestamptz default now()
);

-- Servers
create table public.servers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  agent_id uuid unique not null,
  hostname text not null,
  machine_id text not null,
  os_name text,
  os_version text,
  kernel text,
  cpu_model text,
  cores int,
  mem_bytes bigint,
  agent_version text,
  tags jsonb default '{}'::jsonb,
  first_seen timestamptz default now(),
  last_seen timestamptz
);
create index on public.servers (org_id);
create unique index on public.servers (org_id, machine_id);

-- Heartbeats (append‑only; consider monthly partitions)
create table public.heartbeats (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  server_id uuid not null references servers(id) on delete cascade,
  ts timestamptz not null,
  uptime_s bigint,
  load_1m double precision,
  load_5m double precision,
  load_15m double precision,
  cpu_pct double precision,
  mem_used bigint,
  mem_free bigint,
  swap_used bigint
);
create index on public.heartbeats (server_id, ts);
create index on public.heartbeats using brin (ts);

-- Disks
create table public.disks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  server_id uuid not null references servers(id) on delete cascade,
  ts timestamptz not null,
  mount text,
  fs text,
  size_bytes bigint,
  used_bytes bigint,
  inodes_used bigint
);
create index on public.disks (server_id, ts);

-- Network interfaces (throughput per poll)
create table public.network_ifaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  server_id uuid not null references servers(id) on delete cascade,
  ts timestamptz not null,
  name text,
  mac text,
  ipv4 jsonb,
  ipv6 jsonb,
  rx_bytes bigint,
  tx_bytes bigint
);

-- Top processes snapshot (N items)
create table public.processes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  server_id uuid not null references servers(id) on delete cascade,
  ts timestamptz not null,
  pid int,
  cmd text,
  cpu_pct double precision,
  mem_bytes bigint,
  usr text
);

-- Packages & updates summary
create table public.packages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  server_id uuid not null references servers(id) on delete cascade,
  ts timestamptz not null,
  name text,
  version text,
  status text
);

create table public.updates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  server_id uuid not null references servers(id) on delete cascade,
  ts timestamptz not null,
  security_updates_count int,
  regular_updates_count int,
  details jsonb
);

-- Lightweight logs (optional)
create table public.logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  server_id uuid not null references servers(id) on delete cascade,
  ts timestamptz not null,
  source text,
  level text,
  message text,
  raw jsonb
);
create index on public.logs (server_id, ts);

-- Alerts
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  server_id uuid not null references servers(id) on delete cascade,
  ts timestamptz not null,
  type text,
  severity text check (severity in ('info','warning','critical')),
  message text,
  status text check (status in ('open','cleared')) default 'open'
);

-- API nonces (replay protection)
create table public.api_nonces (
  id bigserial primary key,
  org_id uuid not null,
  agent_id uuid not null,
  nonce text not null,
  ts timestamptz not null
);
create unique index on public.api_nonces (org_id, agent_id, nonce);

-- Rollups (examples)
create table public.heartbeats_rollup_1m (
  bucket timestamptz not null,
  org_id uuid not null,
  server_id uuid not null,
  cpu_avg double precision,
  load1_avg double precision,
  mem_used_avg bigint,
  primary key (server_id, bucket)
);
create index on public.heartbeats_rollup_1m (bucket);

4.1 Row‑Level Security (RLS) policies

-- Enable RLS
alter table public.servers enable row level security;
alter table public.heartbeats enable row level security;
-- (repeat for all tables)

-- Helper: current org from JWT
create or replace function public.current_org() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb->>'org_id','')::uuid;
$$;

-- Example policy: users can see only their org
create policy select_own_org on public.servers
for select using (org_id = public.current_org());

-- Insert/update via Edge Functions (service role); no direct client inserts for ingest tables.


⸻

5) Edge Functions (Deno) — API Surface
	•	POST /enroll — Body: { org_enroll_secret, host_facts } → Returns { agent_id, agent_jwt, refresh_token, hmac_secret }.
	•	POST /ingest — Headers: Authorization: Bearer <agent_jwt>, X-Timestamp, X-Nonce, X-Signature, X-Agent-Version → Body sections: server, heartbeat, disks[], network_ifaces[], processes[], packages[], updates, logs[].
	•	POST /rotate — Body: { agent_id, refresh_token } → Returns new short‑lived JWT.
	•	GET /health — Simple liveness.

5.1 Validation & security
	•	Validate X-Timestamp ±5 min; reject reused X-Nonce per agent.
	•	Recompute HMAC over timestamp + "\n" + nonce + "\n" + sha256(body) using hmac_secret.
	•	Schema validation with zod (shared types via supabase/functions/_shared/schema.ts).
	•	Upsert server identity by (org_id, machine_id); update last_seen.
	•	Insert heartbeats etc. in a single transaction.

5.2 Pseudocode: /ingest

import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const Heartbeat = z.object({
  ts: z.string().datetime(), uptime_s: z.number().int().nonnegative(),
  load: z.object({ m1: z.number(), m5: z.number(), m15: z.number() }),
  cpu_pct: z.number(),
  mem: z.object({ used: z.number().int(), free: z.number().int(), swap_used: z.number().int() })
});

export default async (req: Request) => {
  // 1) AuthN: verify JWT → org_id, agent_id; 2) Verify HMAC + timestamp + nonce
  // 3) Parse JSON with zod; 4) Upsert and insert rows; 5) return 200
};

5.3 Scheduled functions
	•	offline_detector: every 5 minutes, mark servers offline if now() - last_seen > interval '10 minutes' and raise an alert.
	•	rollup_builder: every minute/5 minutes, compute aggregates into *_rollup_* tables.
	•	retention_pruner: nightly prune raw/process/logs beyond policy.

⸻

6) Python Agent

Runtime & packaging
	•	Python ≥ 3.10; packaged in /opt/rms-agent venv. Executable: /opt/rms-agent/bin/rms-agent (entrypoint script).
	•	Deps: psutil, requests, distro, pyjwt, platformdirs (for config path). Optional: python-apt.

Install flow
	1.	curl -fsSL https://example/install.sh | sudo Python → creates venv, installs package, writes systemd units.
	2.	rms-agent enroll --org-secret <...> → saves /etc/rms/credentials with ORG_ID, AGENT_ID, REFRESH_TOKEN, HMAC_SECRET.
	3.	Timer runs every 5 minutes: rms-agent run → collects → gzip → signs → POST /ingest.

Systemd units

# /etc/systemd/system/rms-agent.service
[Unit]
Description=RMS Python Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/rms-agent/bin/rms-agent run
EnvironmentFile=-/etc/rms/credentials
Nice=10

[Install]
WantedBy=multi-user.target

# /etc/systemd/system/rms-agent.timer
[Unit]
Description=Run RMS Agent every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
RandomizedDelaySec=30s
Persistent=true

[Install]
WantedBy=timers.target

Collection (defaults)
	•	Identity: /etc/machine-id, socket.getfqdn(), distro/platform, uname.
	•	CPU/Mem: psutil.cpu_percent(interval=0), psutil.virtual_memory(), psutil.swap_memory().
	•	Uptime & load: /proc/uptime, /proc/loadavg.
	•	Disks: psutil.disk_partitions(), psutil.disk_usage().
	•	Network: psutil.net_if_addrs(), psutil.net_io_counters(pernic=True).
	•	Processes: top N=30 by memory/cpu from psutil.process_iter().
	•	Packages/Updates: parse apt-get -s upgrade or unattended-upgrades --dry-run.
	•	Logs (optional): journalctl -n 200 -o json if present.

Payload shape (example)

{
  "server": {
    "agent_id": "uuid",
    "hostname": "ip-10-0-0-12",
    "machine_id": "ab12...",
    "os": {"name":"Ubuntu","version":"22.04"},
    "kernel": "6.8.0-35-generic",
    "cpu": {"model":"Xeon","cores":8},
    "mem_bytes": 34359738368,
    "agent_version": "0.1.0",
    "tags": {"env":"prod","role":"api"}
  },
  "heartbeat": {"ts": "2025-10-05T03:05:04Z", "uptime_s":123456, "load":{"m1":0.38,"m5":0.41,"m15":0.35}, "cpu_pct":12.3, "mem":{"used":10737418240, "free":22817013760, "swap_used":0}},
  "disks":[{"mount":"/","fs":"ext4","size_bytes":21474836480,"used_bytes":1234567890,"inodes_used":12345}],
  "network_ifaces":[{"name":"eth0","mac":"aa:bb:cc:dd:ee:ff","ipv4":["10.0.0.12"],"ipv6":["fe80::1"],"rx_bytes":123,"tx_bytes":456}],
  "processes":[{"pid":123,"cmd":"/usr/bin/node api.js","cpu_pct":2.1,"mem_bytes":104857600,"user":"ubuntu"}],
  "packages":[{"name":"openssl","version":"3.0.2-0ubuntu1"}],
  "updates":{"security_updates_count":2,"regular_updates_count":3,"details":[{"name":"linux-generic","current":"6.8.0","candidate":"6.9.1","security":true}]},
  "logs":[{"ts":"2025-10-05T03:05:02Z","source":"journal","level":"warning","message":"nginx: worker exited","raw":{}}]
}

Error handling
	•	Retry with exponential backoff and jitter on network/5xx; rotate JWT on 401; re‑enroll on 403 with specific code.
	•	Local queue: persist up to N payloads on disk when offline; flush FIFO.

⸻

7) Web App (Solid.js + Tailwind)

Auth & access
	•	Supabase Auth (email magic link). On login, fetch org membership; guard all queries by org via RLS.

Pages
	•	/fleet: table (hostname, env/role tags, last seen, CPU sparkline, updates badge, status chip).
	•	/server/:id: header with identity; tabs: Overview (live heartbeat chart), Disks, Network, Processes, Updates, Logs, Alerts.
	•	/alerts: open alerts list, filters by type/severity.
	•	/settings: show enrollment command, token rotation, retention settings.

Realtime
	•	Subscribe to servers (last_seen) and alerts. Debounce UI updates; show offline when now()-last_seen>10m.

Charts
	•	Recharts: CPU %, Load (1/5/15), Mem used, per‑mount disk usage, per‑NIC rx/tx. Time range picker (1h/6h/24h/7d/30d/custom) with auto selection of rollup tables.

⸻

8) Time‑Series & Rollups

Sampling: 5‑minute default from agent (configurable via policy returned by enroll).

Rollup strategy
	•	Raw heartbeats retained short‑term (e.g., 30–90 days).
	•	heartbeats_rollup_1m and heartbeats_rollup_1h for long‑term charts.
	•	Scheduled function aggregates by bucket: avg CPU, avg load, avg mem_used. For throughput (rx/tx), sum deltas.

Partitioning & indexing
	•	Monthly partitions for heartbeats, logs, processes to keep indexes small. BRIN on ts.

Retention
	•	Configurable per org. Example default: raw 60d, 1m 6mo, 1h 13mo.

⸻

9) Alerts & Rules (v1)
	•	Offline: no heartbeat in 10 minutes → open alert; clear on next heartbeat.
	•	Disk usage: any mount > 90% used → warning; > 95% critical.
	•	Load: load_5m > cores * 2 sustained across 3 polls.
	•	Security updates available: security_updates_count > 0 (info/warning).

Alerts are inserted by scheduled jobs or on ingest and broadcast via Realtime for the UI.

⸻

10) Deployment & Environments
	•	Supabase project: enable extensions pgcrypto, uuid-ossp if needed; set ORG_ENROLL_SECRET via config.
	•	Edge Functions: deploy enroll, ingest, rotate, health; set rate limits in config.
	•	Agent distribution: host install script and Python wheel; or private APT repo for package distribution.
	•	Environments: dev (sandbox org), staging, prod. Separate Supabase projects or schemas.

⸻

11) Observability & SLOs
	•	Edge Functions: log structured entries (request_id, agent_id, route, latency_ms, code). Target p95 latency < 300 ms; error rate < 1%.
	•	DB: monitor table growth, index bloat, vacuum. Track ingest rows/min.
	•	Agent: local log at /var/log/rms-agent.log (rotated) with last error.

⸻

12) Testing Strategy
	•	Contract tests: Shared JSON schema (zod) used by agent (via generated TS/JSON) and Edge Functions.
	•	Edge Functions: unit tests for validators, HMAC, nonce, and DB upserts; integration tests with Testcontainers or Supabase local.
	•	Agent: unit tests for collectors/parsers; integration tests against a mock ingest endpoint; fault injection (clock skew, offline cache, 401 rotate flow).
	•	Web: component tests for charts/tables; e2e smoke tests for login, fleet view, server detail.
	•	Load tests: k6 simulating N servers * QPS; observe DB/Function headroom.

⸻

13) Phased Roadmap
	•	Phase 1: Enroll + heartbeat + identity; fleet list & server detail; offline detector.
	•	Phase 2: Disks, updates, basic alerts; settings page.
	•	Phase 3: Processes, network, lightweight logs; CSV export.
	•	Phase 4: Rollups, charts, annotations (deploys/reboots/alerts).
	•	Phase 5: Tagging, search, dashboards; SSO; multi‑org admin.

⸻

14) Open Questions
	•	Do we enable logs by default or opt‑in per org? Storage cost vs visibility.
	•	Minimum supported Ubuntu/Python? (e.g., Ubuntu 20.04+, Python 3.10+)
	•	Any need for mTLS within a private network?
	•	Desired default retentions for raw vs rollups?

⸻

15) Development Checklist — for AI Coding Agent

Treat this as a step‑by‑step plan with acceptance criteria.

A) Supabase Setup
	1.	Create project & env vars: ORG_ENROLL_SECRET (random 32+ chars).
	•	Acceptance: Secret present; service role key stored in CI.
	2.	Run DDL to create tables, indexes, functions (current_org()), and enable RLS.
	•	Acceptance: All tables exist; RLS enabled; policies compiled.
	3.	Policies: Add select_own_org (and equivalents) on all read tables; block insert/update from anon.
	•	Acceptance: Client can read only its org’s rows; inserts fail from anon.

B) Edge Functions (Deno)
	4.	Shared libs: /_shared/ utils for JWT claims → org/agent; HMAC verify; nonce storage; zod schemas.
	•	Acceptance: Unit tests pass; 100% coverage for HMAC + nonce TTL.
	5.	/enroll: Verify org_enroll_secret; hash/persist; create agent_id; return JWT (15–60 min ttl), refresh token, hmac_secret.
	•	Acceptance: Given valid secret + host facts, server row upserted and credentials returned; invalid secret → 403.
	6.	/ingest: Verify JWT, timestamp, nonce, HMAC; validate JSON; upsert server; insert batch rows in tx.
	•	Acceptance: Valid payload → 200; bad schema → 422; replayed nonce → 409; skew > 5m → 401.
	7.	/rotate: Exchange refresh token for new JWT; rotate if ≤ 7 days to expiry.
	•	Acceptance: Old JWT invalid; new JWT accepted by /ingest.
	8.	/health: return 200 JSON with version + time.

C) Scheduled Jobs
	9.	offline_detector: mark offline, open/close alerts.
	•	Acceptance: Server without heartbeat ≥10m triggers alert; next heartbeat clears it.
	10.	rollup_builder: 1m & 1h buckets for heartbeats; idempotent upserts.
	•	Acceptance: Query charts over 7d uses rollups; raw only for ≤6h window.
	11.	retention_pruner: prune old heartbeats/logs/processes per policy; vacuum analyze.
	•	Acceptance: Row counts drop in old partitions; no FK violations.

D) Python Agent
	12.	Package rms_agent with CLI (enroll, run, rotate); config at /etc/rms/credentials.
	•	Acceptance: rms-agent enroll --org-secret writes credentials.
	13.	Collector modules for identity, heartbeat, disks, net, processes, updates, logs (optional); cap processes to N=30.
	•	Acceptance: rms-agent run prints JSON when --dry-run; valid schema per zod.
	14.	Transport: gzip body, set headers, compute HMAC; retries with backoff; offline file queue.
	•	Acceptance: Network flap test preserves payloads and flushes later; 401 triggers rotate.
	15.	Systemd units installed & enabled; timer fires every 5 minutes.
	•	Acceptance: systemctl status rms-agent.timer shows recent runs; Supabase receives rows.

E) Web App (Solid.js)
	16.	Auth bootstrap with Supabase; session management.
	•	Acceptance: Login via magic link works; displays org name.
	17.	/fleet page with sparklines & status chips; filter by tag.
	•	Acceptance: New heartbeat updates last‑seen and sparkline without refresh.
	18.	/server/:id with charts and tabs; time‑range picker; switch raw/rollup.
	•	Acceptance: CPU chart responds to range; processes/updates tabs load.
	19.	/alerts list with severity filters; realtime updates.
	•	Acceptance: Offline test shows alert within 5–10 minutes.
	20.	Settings shows enrollment command, retention sliders.

F) CI/CD & Quality
	21.	Tests in monorepo (pnpm workspaces or similar): Edge Functions, Agent, Web.
	22.	Lint/format: biome/eslint + black/ruff + deno fmt.
	23.	Preview env: deploy Edge Functions to staging; connect web preview to staging.
	24.	Docs: README with enroll command and uninstaller; versioned changelog.

⸻

16) Developer Notes & Conventions
	•	Timestamps: Always UTC ISO 8601 (toISOString(), datetime in zod).
	•	IDs: Use agent_id in headers/body only for correlation; trust is from JWT claims.
	•	Tags: Free‑form jsonb on servers; index commonly used keys via generated columns if needed.
	•	Sizing guidance: 100 servers @ 5‑min cadence ≈ 28,800 heartbeats/day; rollups reduce chart scans by >90%.

⸻

17) Quickstart Commands (admin)

# Run DDL (psql or Supabase SQL editor), then deploy functions
supabase functions deploy enroll ingest rotate health
# Configure schedules
supabase functions deploy offline_detector rollup_builder retention_pruner
# Show enroll command for new server
echo "sudo rms-agent enroll --org-secret <ORG_ENROLL_SECRET>"