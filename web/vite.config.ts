import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['solid-js', '@solidjs/router'],
          'supabase': ['@supabase/supabase-js'],
          'charts': ['chart.js', 'solid-chartjs'],
        }
      }
    }
  },
  // Cloudflare Pages compatibility
  base: '/',
})
