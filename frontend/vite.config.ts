import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    __COMMIT_SHA__: JSON.stringify(process.env.RENDER_GIT_COMMIT || process.env.VITE_COMMIT_SHA || 'dev'),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        changeOrigin: true,
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', 'zustand', 'axios'],
          ui: ['lucide-react', 'emoji-picker-react', 'date-fns'],
        },
      },
    },
  },
})
