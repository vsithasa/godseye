-- Setup script for creating an organization and configuring cron jobs
-- Run this in the Supabase SQL Editor

-- =============================================================================
-- 1. Create Organization (REPLACE VALUES BELOW)
-- =============================================================================

-- First, generate a strong enrollment secret (32+ chars)
-- Example using: openssl rand -hex 32
-- Save this secret! You'll need it to enroll agents.

INSERT INTO orgs (name, enroll_secret_hash)
VALUES (
  'My Organization',  -- Replace with your org name
  encode(digest('YOUR_ENROLLMENT_SECRET_HERE', 'sha256'), 'hex')  -- Replace with your secret
)
RETURNING id, name;

-- =============================================================================
-- 2. Setup pg_cron Extension (if not already enabled)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Note: pg_cron may not be available on all Supabase plans
-- Alternative: Use Supabase's built-in cron triggers in the dashboard

-- =============================================================================
-- 3. Schedule Functions with pg_cron
-- =============================================================================

-- IMPORTANT: Replace YOUR_CRON_SECRET with the value you set via:
-- supabase secrets set CRON_SECRET=your-value

-- Offline Detector (every 5 minutes)
SELECT cron.schedule(
  'godseye-offline-detector',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url:='https://vwfzujkqfplmvyljoiki.supabase.co/functions/v1/offline-detector',
    headers:='{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb
  ) AS request_id;$$
);

-- Rollup Builder (every 5 minutes)
SELECT cron.schedule(
  'godseye-rollup-builder',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url:='https://vwfzujkqfplmvyljoiki.supabase.co/functions/v1/rollup-builder',
    headers:='{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb
  ) AS request_id;$$
);

-- Nonce Cleanup (every 15 minutes)
SELECT cron.schedule(
  'godseye-nonce-cleanup',
  '*/15 * * * *',
  $$SELECT net.http_post(
    url:='https://vwfzujkqfplmvyljoiki.supabase.co/functions/v1/nonce-cleanup',
    headers:='{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb
  ) AS request_id;$$
);

-- =============================================================================
-- 4. Verify Cron Jobs
-- =============================================================================

SELECT jobid, schedule, command 
FROM cron.job 
WHERE jobname LIKE 'godseye-%';

-- =============================================================================
-- 5. View Cron Job History
-- =============================================================================

SELECT jobid, runid, status, return_message, start_time, end_time
FROM cron.job_run_details
WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname LIKE 'godseye-%')
ORDER BY start_time DESC
LIMIT 10;

-- =============================================================================
-- 6. (Optional) Remove Cron Jobs
-- =============================================================================

-- Uncomment to remove:
-- SELECT cron.unschedule('godseye-offline-detector');
-- SELECT cron.unschedule('godseye-rollup-builder');
-- SELECT cron.unschedule('godseye-nonce-cleanup');

