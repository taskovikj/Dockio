#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/dockio-panel/app}"
DATA_DIR="${DATA_DIR:-/var/lib/dockio-panel}"
ENV_DIR="${ENV_DIR:-/etc/dockio-panel}"
RUN_USER="${RUN_USER:-dockio}"
PANEL_PORT="${PANEL_PORT:-3099}"
PANEL_HOST="${PANEL_HOST:-0.0.0.0}"
TRUSTED_CIDR="${TRUSTED_CIDR:-}"
KEEP_DEV_DEPS="${DIO_KEEP_DEV_DEPS:-false}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash scripts/install.sh"
  exit 1
fi

apt-get update
apt-get install -y git curl ca-certificates openssh-client rsync ufw docker.io docker-compose-v2 caddy build-essential python3 make g++

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

corepack enable || true
corepack prepare pnpm@11.0.8 --activate || npm install -g pnpm@11.0.8
SETUP_TOKEN="${DIO_SETUP_TOKEN:-$(node -e 'console.log(require("crypto").randomBytes(18).toString("base64url"))')}"

id "$RUN_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$RUN_USER"
usermod -aG docker "$RUN_USER" || true

mkdir -p "$APP_DIR" "$DATA_DIR" "$ENV_DIR" /etc/caddy/conf.d /etc/caddy/dockio/sites
chown -R "$RUN_USER:$RUN_USER" "$(dirname "$APP_DIR")" "$DATA_DIR"

if [ "$(pwd)" != "$APP_DIR" ]; then
  rsync -a --delete --exclude node_modules --exclude .next --exclude .git "$(pwd)/" "$APP_DIR/"
  chown -R "$RUN_USER:$RUN_USER" "$APP_DIR"
fi

if ! grep -q 'import /etc/caddy/conf.d/\*.caddy' /etc/caddy/Caddyfile 2>/dev/null; then
  printf '\nimport /etc/caddy/conf.d/*.caddy\n' >> /etc/caddy/Caddyfile
fi
if ! grep -q 'import /etc/caddy/dockio/sites/\*.caddy' /etc/caddy/Caddyfile 2>/dev/null; then
  printf '\nimport /etc/caddy/dockio/sites/*.caddy\n' >> /etc/caddy/Caddyfile
fi

cat > "$ENV_DIR/panel.env" <<EOF
DIO_DATA_DIR=$DATA_DIR
DIO_BIND_HOST=$PANEL_HOST
DIO_PORT=$PANEL_PORT
DIO_RUN_USER=$RUN_USER
DIO_SETUP_TOKEN=$SETUP_TOKEN
DIO_TRUSTED_NETWORK_ONLY=${DIO_TRUSTED_NETWORK_ONLY:-false}
DIO_TRUSTED_CIDRS=$TRUSTED_CIDR
NODE_ENV=production
EOF

chown root:"$RUN_USER" "$ENV_DIR/panel.env"
chmod 640 "$ENV_DIR/panel.env"

cat > /etc/sudoers.d/dockio-panel <<EOF
$RUN_USER ALL=(root) NOPASSWD: /usr/sbin/ufw status, /usr/sbin/ufw status *, /usr/sbin/ufw allow *, /usr/sbin/ufw deny *, /usr/sbin/ufw --force delete *, /usr/sbin/ufw --force enable
$RUN_USER ALL=(root) NOPASSWD: /usr/bin/systemctl daemon-reload, /bin/systemctl daemon-reload, /usr/bin/systemctl reload caddy, /bin/systemctl reload caddy, /usr/bin/systemctl enable --now dio-*.service, /bin/systemctl enable --now dio-*.service, /usr/bin/systemctl restart dio-*.service, /bin/systemctl restart dio-*.service, /usr/bin/systemctl disable --now dio-*.service, /bin/systemctl disable --now dio-*.service
$RUN_USER ALL=(root) NOPASSWD: /usr/bin/install -m 0644 -o root -g root * /etc/caddy/conf.d/dio_*.caddy, /usr/bin/install -m 0644 -o root -g root * /etc/caddy/dockio/sites/preview-*.caddy, /usr/bin/install -m 0644 -o root -g root * /etc/systemd/system/dio-*.service
$RUN_USER ALL=(root) NOPASSWD: /usr/bin/mkdir -p /etc/caddy/conf.d, /bin/mkdir -p /etc/caddy/conf.d, /usr/bin/mkdir -p /etc/caddy/dockio/sites, /bin/mkdir -p /etc/caddy/dockio/sites
$RUN_USER ALL=(root) NOPASSWD: /usr/bin/rm -f /etc/caddy/conf.d/dio_*.caddy, /bin/rm -f /etc/caddy/conf.d/dio_*.caddy, /usr/bin/rm -f /etc/caddy/dockio/sites/preview-*.caddy, /bin/rm -f /etc/caddy/dockio/sites/preview-*.caddy
$RUN_USER ALL=(root) NOPASSWD: /usr/bin/caddy validate --config /etc/caddy/Caddyfile, /usr/sbin/caddy validate --config /etc/caddy/Caddyfile
EOF
chmod 440 /etc/sudoers.d/dockio-panel

cd "$APP_DIR"
sudo -H -u "$RUN_USER" pnpm install --frozen-lockfile
sudo -H -u "$RUN_USER" pnpm build
if [ "$KEEP_DEV_DEPS" != "true" ]; then
  sudo -H -u "$RUN_USER" pnpm prune --prod
  sudo -H -u "$RUN_USER" rm -rf .next/cache .next/dev tsconfig.tsbuildinfo
fi
sudo -H -u "$RUN_USER" pnpm store prune >/dev/null 2>&1 || true

cat > /etc/systemd/system/dockio-panel.service <<EOF
[Unit]
Description=Dockio
After=network-online.target docker.service caddy.service
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_DIR/panel.env
ExecStart=$(command -v pnpm) start --hostname \${DIO_BIND_HOST} --port \${DIO_PORT}
Restart=on-failure
RestartSec=5
# The panel uses a narrow sudoers allowlist for Caddy, UFW, and systemd actions.
# NoNewPrivileges=true blocks sudo completely, so keep this false for managed VPS actions.
NoNewPrivileges=false
PrivateTmp=true
ReadWritePaths=$DATA_DIR /etc/caddy/conf.d /etc/caddy/dockio/sites /etc/systemd/system

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now docker caddy
systemctl enable dockio-panel
systemctl restart dockio-panel

if [ -n "$TRUSTED_CIDR" ]; then
  ufw allow OpenSSH || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
  ufw allow from "$TRUSTED_CIDR" to any port "$PANEL_PORT" proto tcp || true
  ufw --force enable || true
fi

echo "Dockio installed."
echo "Open: http://SERVER_IP:$PANEL_PORT"
echo "First admin setup code: $SETUP_TOKEN"
echo "The setup code is stored in $ENV_DIR/panel.env as DIO_SETUP_TOKEN."
echo "If the panel port is public, create the admin account immediately and restrict firewall access."
