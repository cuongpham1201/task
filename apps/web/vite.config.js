import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Lắng nghe mọi interface để Cloudflare Tunnel kết nối được.
    host: '0.0.0.0',
    port: 5173,
    // Cho phép truy cập qua domain tunnel; localhost/127.0.0.1 luôn được phép.
    allowedHosts: ['task.biahalong.com'],
    // Proxy /api → NestJS (4000): trình duyệt chỉ nói chuyện 1 origin.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
