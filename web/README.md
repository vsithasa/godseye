# Godseye Web Dashboard

Modern real-time fleet monitoring dashboard built with Solid.js and Supabase.

## Features

- 🔐 Email/password authentication via Supabase
- 📊 Real-time server monitoring
- 🎯 Live heartbeat tracking
- 📈 System metrics visualization (CPU, memory, disk, network)
- 🔄 Automatic updates via Supabase Realtime
- 🎨 Beautiful dark theme UI with Tailwind CSS

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Environment Variables

Create a `.env` file:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Or use the hardcoded values in `src/config.ts` for development.

## Tech Stack

- **Framework**: Solid.js
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Supabase (Auth + Database + Realtime)
- **Build Tool**: Vite
- **Charts**: Chart.js (via solid-chartjs)
