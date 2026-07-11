// PM2 — App Giao việc (task.biahalong.com qua Cloudflare Tunnel → :5173, vite proxy /api → :4000)
// API tự nạp .env qua `node --env-file=.env` (không dùng ConfigModule/dotenv).
// Chạy:  pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'giaoviec-api',
      cwd: '/data/dev/task-app/task/apps/api',
      script: 'npm',
      args: 'start', // = node --env-file=.env dist/main.js (PORT=4000)
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'giaoviec-web',
      cwd: '/data/dev/task-app/task/apps/web',
      script: 'npm',
      args: 'run preview', // vite preview :5173 — serve dist TĨNH (UAT ổn định; build lại rồi restart khi có code mới)
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
    },
  ],
}
