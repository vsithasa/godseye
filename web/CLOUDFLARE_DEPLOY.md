# Deploying to Cloudflare Pages

This guide explains how to deploy the Godseye web platform to Cloudflare Pages.

## Prerequisites

1. A Cloudflare account
2. Wrangler CLI installed (included in devDependencies)
3. Authenticated with Cloudflare: `npx wrangler login`

## Deployment Methods

### Method 1: Using npm scripts (Recommended)

```bash
# Install dependencies (first time only)
npm install

# Deploy to preview environment
npm run deploy

# Deploy to production (main branch)
npm run deploy:prod
```

### Method 2: Using Wrangler directly

```bash
# Build the project
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name=godseye-web
```

### Method 3: Connect Git Repository (Continuous Deployment)

1. Go to [Cloudflare Pages Dashboard](https://dash.cloudflare.com/pages)
2. Click "Create a project"
3. Connect your GitHub repository
4. Configure build settings:
   - **Framework preset**: None (or Vite)
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `web`
   - **Node version**: 18 or higher

5. Add environment variables (if needed):
   - `VITE_SUPABASE_URL`: Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous key

6. Click "Save and Deploy"

## Environment Variables

Make sure your `src/config.ts` is properly configured or use environment variables:

```typescript
// In src/config.ts
export const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || 'your-default-url',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-default-key',
};
```

## Build Configuration

The build is optimized for Cloudflare Pages with:

- **Code splitting**: Vendor, Supabase, and Charts bundles are separated
- **Minification**: ESBuild for fast production builds
- **ES2020 target**: Modern JavaScript for better performance
- **SPA routing**: All routes redirect to `index.html` via `_redirects`

## Custom Domain

To add a custom domain:

1. Go to your Cloudflare Pages project
2. Navigate to "Custom domains"
3. Add your domain
4. Cloudflare will automatically configure DNS if your domain is on Cloudflare

## Troubleshooting

### Routes not working (404 errors)

The `public/_redirects` file ensures all routes serve `index.html`. Make sure this file exists and is included in the build output.

### Environment variables not loading

Ensure environment variables are prefixed with `VITE_` and are set in:
- Local development: `.env.local` file
- Cloudflare Pages: Project Settings > Environment variables

### Build failures

- Check Node.js version (18+ recommended)
- Clear cache: `rm -rf node_modules dist && npm install`
- Verify all dependencies are installed

## Performance

Cloudflare Pages provides:
- Global CDN with edge caching
- Automatic HTTPS
- DDoS protection
- HTTP/3 support
- Instant cache invalidation on deploy

Expected load times: < 500ms globally

## Monitoring

View deployment analytics in the Cloudflare Pages dashboard:
- Build history
- Deployment logs
- Analytics and Web Vitals
- Real-time traffic

## Additional Resources

- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)
- [SolidJS Deployment Guide](https://docs.solidjs.com/guides/deployment)

