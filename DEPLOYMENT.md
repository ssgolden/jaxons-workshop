# Jaxon's Workshop Deployment

## Production Checklist

1. Set a permanent `JWT_SECRET`.
2. Run with `NODE_ENV=production`.
3. Keep the app on an internal port like `3006`.
4. Put OpenLiteSpeed in front as a reverse proxy.
5. Back up `database/jaxons.db` and `uploads/` before each deploy.

## Local Git Setup

```powershell
cd "C:\Users\steph\OneDrive\Desktop\jaxons web"
git init
git add .
git commit -m "Initial production deployment"
git branch -M main
```

## GitHub Push

Create an empty GitHub repository first, then run:

```powershell
git remote add origin git@github.com:YOUR_GITHUB_USERNAME/jaxons-workshop.git
git push -u origin main
```

If you use HTTPS instead of SSH:

```powershell
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/jaxons-workshop.git
git push -u origin main
```

## Ubuntu 24.04 Server Setup

```bash
sudo apt update
sudo apt install -y git curl unzip
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## Pull To Server

```bash
sudo mkdir -p /var/www/jaxons
sudo chown -R $USER:$USER /var/www/jaxons
cd /var/www
git clone git@github.com:YOUR_GITHUB_USERNAME/jaxons-workshop.git jaxons
cd /var/www/jaxons
npm ci --omit=dev
cp .env.example .env
nano .env
```

## PM2

```bash
cd /var/www/jaxons
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Run the command printed by `pm2 startup`, then:

```bash
pm2 save
```

Useful PM2 commands:

```bash
pm2 list
pm2 logs jaxons-workshop
pm2 restart jaxons-workshop
pm2 stop jaxons-workshop
pm2 delete jaxons-workshop
```

## OpenLiteSpeed Reverse Proxy

Use OpenLiteSpeed as the public web server and keep Node private on `127.0.0.1:3006`.

Create an external app named `jaxons_node`:

- Type: Web Server
- Address: `127.0.0.1:3006`
- Max Connections: `100`
- Initial Request Timeout: `60`
- Retry Timeout: `0`
- Response Buffering: `No`

Then attach a proxy context for `/` to `jaxons_node`.

If websocket support is enabled separately in your panel, include Socket.IO traffic too.

## Updating Production

```bash
cd /var/www/jaxons
cp database/jaxons.db database/jaxons.db.bak-$(date +%F-%H%M)
git pull origin main
npm ci --omit=dev
pm2 restart jaxons-workshop
```
