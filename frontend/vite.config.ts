import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Three pages: the composer (index.html), the leaderboard (ranking.html) and Sonyx Wrapped (wrapped.html).
    rolldownOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        ranking: resolve(__dirname, 'ranking.html'),
        wrapped: resolve(__dirname, 'wrapped.html'),
      },
    },
  },
  server: {
    // Dev: forward the WebSocket and REST API to the Spring Boot backend so the client can stay same-origin.
    proxy: {
      '/ws': { target: 'ws://localhost:8080', ws: true },
      '/api': { target: 'http://localhost:8080' },
      // GitHub sign-in (Spring Security's OAuth2 redirect and callback). Keep the browser's Host so the
      // callback URL stays http://localhost:5173/login/oauth2/code/github.
      '/oauth2': { target: 'http://localhost:8080', changeOrigin: false },
      '/login/oauth2': { target: 'http://localhost:8080', changeOrigin: false },
    },
  },
})
