#!/usr/bin/env bash
set -euo pipefail

APP_NAME="jaxons-workshop"
APP_DIR="/var/www/jaxons"
REPO_URL="${REPO_URL:-https://github.com/ssgolden/jaxons-workshop.git}"
BRANCH="${BRANCH:-main}"
PORT="${PORT:-3006}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root."
  exit 1
fi

if [[ ! -f /etc/os-release ]]; then
  echo "Unsupported system."
  exit 1
fi

. /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
  echo "This script targets Ubuntu."
  exit 1
fi

apt-get update
apt-get install -y git curl ca-certificates

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

mkdir -p /var/www

if [[ ! -d "${APP_DIR}/.git" ]]; then
  git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
else
  git -C "${APP_DIR}" fetch origin
  git -C "${APP_DIR}" checkout "${BRANCH}"
  git -C "${APP_DIR}" pull --ff-only origin "${BRANCH}"
fi

cd "${APP_DIR}"
npm ci --omit=dev

mkdir -p database uploads

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created ${APP_DIR}/.env. Edit it before exposing the site."
fi

pm2 start ecosystem.config.cjs --update-env
pm2 save

if command -v systemctl >/dev/null 2>&1; then
  pm2 startup systemd -u root --hp /root >/tmp/pm2-startup.txt
  bash /tmp/pm2-startup.txt || true
  pm2 save
fi

echo
echo "Deployment bootstrap complete."
echo "App path: ${APP_DIR}"
echo "PM2 app: ${APP_NAME}"
echo "Expected internal port: ${PORT}"
echo
echo "Next steps:"
echo "1. Edit ${APP_DIR}/.env and set JWT_SECRET."
echo "2. Restore database/jaxons.db and uploads/ if needed."
echo "3. Point OpenLiteSpeed proxy/vhost to 127.0.0.1:${PORT}."
echo "4. Run: pm2 restart ${APP_NAME}"
