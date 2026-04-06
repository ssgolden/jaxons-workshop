module.exports = {
  apps: [
    {
      name: 'jaxons-workshop',
      script: 'server.js',
      cwd: '/var/www/jaxons',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3006
      }
    }
  ]
};
