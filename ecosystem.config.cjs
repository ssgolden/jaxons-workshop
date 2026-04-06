const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.split(/\r?\n/).reduce((env, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return env;
      }

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex === -1) {
        return env;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (key) {
        env[key] = value;
      }
      return env;
    }, {});
  } catch {
    return {};
  }
}

const envFromFile = loadEnvFile(path.join(__dirname, '.env'));

module.exports = {
  apps: [
    {
      name: 'jaxons-workshop',
      script: 'server.js',
      cwd: '/var/www/jaxons',
      instances: 1,
      exec_mode: 'fork',
      env: {
        ...envFromFile,
        NODE_ENV: 'production',
        PORT: 3006
      }
    }
  ]
};
