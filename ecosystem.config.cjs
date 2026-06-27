module.exports = {
  apps: [
    {
      name: 'openfirehouse',
      script: 'src/index.js',
      cwd: process.env.APP_SERVER_PATH || require('path').resolve(__dirname, 'server'),
      watch: false,
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'development',
        PORT: 3005,
      },
    },
  ],
};
