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
  // UAT nhiều user thật: serve BẢN BUILD tĩnh qua `vite preview` (ổn định, không
  // re-optimize deps giữa phiên như dev server → hết lỗi "2 bản React"/trang trắng).
  // preview kế thừa proxy/allowedHosts khai báo tường minh dưới đây.
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['task.biahalong.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
