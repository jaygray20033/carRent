module.exports = {
  apps: [
    {
      name: 'otorent-be',
      script: 'src/app.js',
      cwd: '/home/user/webapp/carRent-be',
      env: {
        NODE_ENV: 'development',
        PORT: 4000,
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
