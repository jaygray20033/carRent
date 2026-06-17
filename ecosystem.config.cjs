module.exports = {
  apps: [
    {
      name: 'carrent-be',
      cwd: '/home/user/webapp/carRent-be',
      script: 'npm',
      args: 'run dev',
      env: { NODE_ENV: 'development', PORT: 4000 },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
