'use strict';

/* PM2 — processo isolado do Day Lanches.
   Nao mexe em outros apps que ja existam na VPS: nao usa `pm2 kill`,
   nao sobrescreve configuracao global, cada `pm2 start` so afeta este app. */
module.exports = {
  apps: [
    {
      name: 'day-lanches-agent',
      cwd: __dirname,
      script: './src/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 30,
      min_uptime: '10s',
      restart_delay: 3000,
      watch: false,
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
