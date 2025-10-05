# Godseye Edge Functions

Edge Functions for the Godseye fleet monitoring system. All functions run on Supabase's Deno runtime.

## Functions

### Agent API Functions

#### `/enroll`
**POST** - Enrolls a new server or re-enrolls an existing one.

**Request:**
```json
{
  "org_enroll_secret": "your-secret-here",
  "host_facts": {
    "hostname": "server-01",
    "machine_id": "abc123...",
    "os": { "name": "Ubuntu", "version": "22.04" },
    "kernel": "6.8.0-35-generic",
    "cpu": { "model": "Intel Xeon", "cores": 8 },
    "mem_bytes": 34359738368,
    "agent_version": "0.1.0",
    "tags": { "env": "prod", "role": "api" }
  }
}
```

**Response:**
```json
{
  "agent_id": "uuid",
  "agent_jwt": "eyJ...",
  "refresh_token": "hex-string",
  "hmac_secret": "hex-string",
  "org_id": "uuid"
}
```

---

#### `/ingest`
**POST** - Receives metrics from agents.

**Headers:**
- `Authorization: Bearer <agent_jwt>`
- `X-Timestamp: 2025-10-05T12:00:00.000Z`
- `X-Nonce: random-nonce-value`
- `X-Signature: hmac-sha256-hex`
- `X-Agent-Version: 0.1.0`
- `Content-Encoding: gzip` (optional)

**Request Body:** See `_shared/schema.ts` for full schema.

**Response:**
```json
{
  "success": true,
  "received_at": "2025-10-05T12:00:00.000Z"
}
```

---

#### `/rotate`
**POST** - Rotates JWT and refresh token.

**Request:**
```json
{
  "agent_id": "uuid",
  "refresh_token": "current-refresh-token"
}
```

**Response:**
```json
{
  "agent_jwt": "eyJ...",
  "refresh_token": "new-hex-string"
}
```

---

#### `/health`
**GET** - Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-05T12:00:00.000Z",
  "version": "0.1.0"
}
```

---

### Scheduled Functions

#### `/offline-detector`
Detects offline servers and creates/clears alerts. Should run every 5 minutes.

**Trigger:** Supabase Cron or pg_cron
```sql
SELECT cron.schedule('offline-detector', '*/5 * * * *', 
  'SELECT net.http_post(url:=''https://vwfzujkqfplmvyljoiki.supabase.co/functions/v1/offline-detector'', 
  headers:=''{"Authorization": "Bearer YOUR_CRON_SECRET"}''::jsonb) AS request_id;');
```

---

#### `/rollup-builder`
Computes time-series rollups (1m and 1h buckets). Should run every 5-15 minutes.

**Trigger:** Supabase Cron or pg_cron
```sql
SELECT cron.schedule('rollup-builder', '*/5 * * * *', 
  'SELECT net.http_post(url:=''https://vwfzujkqfplmvyljoiki.supabase.co/functions/v1/rollup-builder'', 
  headers:=''{"Authorization": "Bearer YOUR_CRON_SECRET"}''::jsonb) AS request_id;');
```

---

#### `/nonce-cleanup`
Removes old nonces (beyond replay window). Should run every 15-30 minutes.

**Trigger:** Supabase Cron or pg_cron
```sql
SELECT cron.schedule('nonce-cleanup', '*/15 * * * *', 
  'SELECT net.http_post(url:=''https://vwfzujkqfplmvyljoiki.supabase.co/functions/v1/nonce-cleanup'', 
  headers:=''{"Authorization": "Bearer YOUR_CRON_SECRET"}''::jsonb) AS request_id;');
```

---

## Deployment

### 1. Install Supabase CLI
```bash
npm install -g supabase
```

### 2. Link to your project
```bash
supabase link --project-ref vwfzujkqfplmvyljoiki
```

### 3. Set environment secrets
```bash
# JWT secret for agent tokens
supabase secrets set JWT_SECRET=your-secret-here

# Cron secret for scheduled functions
supabase secrets set CRON_SECRET=your-cron-secret-here
```

### 4. Deploy all functions
```bash
supabase functions deploy enroll
supabase functions deploy ingest
supabase functions deploy rotate
supabase functions deploy health
supabase functions deploy offline-detector
supabase functions deploy rollup-builder
supabase functions deploy nonce-cleanup
```

### 5. Test functions
```bash
# Test health endpoint
curl https://vwfzujkqfplmvyljoiki.supabase.co/functions/v1/health

# Test with local dev
supabase functions serve enroll --no-verify-jwt --env-file .env
```

---

## Security Notes

1. **JWT_SECRET**: Must be at least 32 characters. Keep this secret!
2. **CRON_SECRET**: Used to authenticate scheduled function calls.
3. **ORG_ENROLL_SECRET**: Stored hashed in the `orgs` table. Agents use this once during enrollment.
4. **HMAC Secrets**: Per-agent secrets stored in `servers` table, used to sign all ingest requests.
5. **Refresh Tokens**: Per-agent tokens for JWT rotation, stored in `servers` table.

---

## Development

### Local testing
```bash
# Start local Supabase
supabase start

# Serve functions locally
supabase functions serve --env-file .env.local

# Make test request
curl -X POST http://localhost:54321/functions/v1/health
```

### Logs
```bash
# Stream function logs
supabase functions logs enroll --project-ref vwfzujkqfplmvyljoiki
```

---

## Shared Utilities

All shared code lives in `_shared/`:

- **schema.ts** - Zod schemas for validation
- **auth.ts** - JWT, HMAC, and crypto utilities
- **db.ts** - Database helper functions
- **response.ts** - HTTP response helpers

