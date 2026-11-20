import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '^/(admin\\.html|admin\\.js|common\\.js|style\\.css)$': 'http://localhost:3000'
    }
  }
})