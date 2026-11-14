import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Two pages: the composer (index.html) and the leaderboard (ranking.html).
    rolldownOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        ranking: resolve(__dirname, 'ranking.html'),
      },
    },
  },
  server: {
    // Dev: forward the WebSocket and REST API to the Spring Boot backend so the client can stay same-origin.
    proxy: {
      '/ws': { target: 'ws://localhost:8080', ws: true },
      '/api': { target: 'http://localhost:8080' },
    },
  },
})
