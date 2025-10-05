#!/bin/bash
# Deploy all Edge Functions to Supabase

set -e

echo "🚀 Deploying Godseye Edge Functions to Supabase..."
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install it with: npm install -g supabase"
    exit 1
fi

# Link to project (if not already linked)
echo "🔗 Linking to Supabase project..."
supabase link --project-ref vwfzujkqfplmvyljoiki || true

echo ""
echo "📦 Deploying Edge Functions..."
echo ""

# Deploy agent API functions
echo "  → enroll"
supabase functions deploy enroll --no-verify-jwt

echo "  → ingest"
supabase functions deploy ingest --no-verify-jwt

echo "  → rotate"
supabase functions deploy rotate --no-verify-jwt

echo "  → health"
supabase functions deploy health --no-verify-jwt

# Deploy scheduled functions
echo "  → offline-detector"
supabase functions deploy offline-detector --no-verify-jwt

echo "  → rollup-builder"
supabase functions deploy rollup-builder --no-verify-jwt

echo "  → nonce-cleanup"
supabase functions deploy nonce-cleanup --no-verify-jwt

echo ""
echo "✅ All functions deployed successfully!"
echo ""
echo "📋 Next steps:"
echo "   1. Set secrets: supabase secrets set JWT_SECRET=\$(openssl rand -hex 32)"
echo "   2. Set secrets: supabase secrets set CRON_SECRET=\$(openssl rand -hex 32)"
echo "   3. Setup pg_cron schedules (see README.md)"
echo "   4. Create an org and enrollment secret in the database"
echo "   5. Install the Python agent on your servers"
echo ""

