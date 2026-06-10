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
ENABLE_UFW="${DIO_ENABLE_UFW:-true}"
INSTALL_MODE="${DIO_INSTALL_MODE:-container}"
PANEL_IMAGE="${DIO_PANEL_IMAGE:-dockio/panel:local}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash scripts/install.sh"
  exit 1
fi

apt-get update
apt-get install -y git curl ca-certificates openssh-client rsync ufw docker.io docker-compose-v2 docker-buildx caddy build-essential python3 make g++

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

corepack enable || true
corepack prepare pnpm@11.0.8 --activate || npm install -g pnpm@11.0.8
SETUP_TOKEN="${DIO_SETUP_TOKEN:-$(node -e 'console.log(require("crypto").randomBytes(18).toString("base64url"))')}"

install_nixpacks() {
  if command -v nixpacks >/dev/null 2>&1; then
    return 0
  fi
  echo "Installing Nixpacks build CLI..."
  curl -fsSL https://nixpacks.com/install.sh | bash
}

ensure_buildx() {
  if docker buildx version >/dev/null 2>&1; then
    return 0
  fi
  echo "Installing Docker buildx plugin..."
  apt-get install -y docker-buildx
  if ! docker buildx version >/dev/null 2>&1; then
    echo "Docker buildx is still unavailable. Nixpacks deployments will not work until buildx is installed."
  fi
}

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
DIO_INSTALL_MODE=$INSTALL_MODE
NODE_ENV=production
EOF

chown root:"$RUN_USER" "$ENV_DIR/panel.env"
chmod 640 "$ENV_DIR/panel.env"

cat > /etc/sudoers.d/dockio-panel <<EOF
$RUN_USER ALL=(root) NOPASSWD: /usr/sbin/ufw status, /usr/sbin/ufw status *, /usr/sbin/ufw allow *, /usr/sbin/ufw deny *, /usr/sbin/ufw reload, /usr/sbin/ufw disable, /usr/sbin/ufw --force delete *, /usr/sbin/ufw --force enable
$RUN_USER ALL=(root) NOPASSWD: /usr/bin/systemctl daemon-reload, /bin/systemctl daemon-reload, /usr/bin/systemctl reload caddy, /bin/systemctl reload caddy, /usr/bin/systemctl enable --now dio-*.service, /bin/systemctl enable --now dio-*.service, /usr/bin/systemctl restart dio-*.service, /bin/systemctl restart dio-*.service, /usr/bin/systemctl disable --now dio-*.service, /bin/systemctl disable --now dio-*.service
$RUN_USER ALL=(root) NOPASSWD: /usr/bin/install -m 0644 -o root -g root * /etc/caddy/conf.d/dio_*.caddy, /usr/bin/install -m 0644 -o root -g root * /etc/caddy/dockio/sites/preview-*.caddy, /usr/bin/install -m 0644 -o root -g root * /etc/systemd/system/dio-*.service
$RUN_USER ALL=(root) NOPASSWD: /usr/bin/mkdir -p /etc/caddy/conf.d, /bin/mkdir -p /etc/caddy/conf.d, /usr/bin/mkdir -p /etc/caddy/dockio/sites, /bin/mkdir -p /etc/caddy/dockio/sites
$RUN_USER ALL=(root) NOPASSWD: /usr/bin/rm -f /etc/caddy/conf.d/dio_*.caddy, /bin/rm -f /etc/caddy/conf.d/dio_*.caddy, /usr/bin/rm -f /etc/caddy/dockio/sites/preview-*.caddy, /bin/rm -f /etc/caddy/dockio/sites/preview-*.caddy
$RUN_USER ALL=(root) NOPASSWD: /usr/bin/caddy validate --config /etc/caddy/Caddyfile, /usr/sbin/caddy validate --config /etc/caddy/Caddyfile
EOF
chmod 440 /etc/sudoers.d/dockio-panel

install_nixpacks
ensure_buildx

systemctl enable --now docker caddy

if [ "$INSTALL_MODE" = "container" ]; then
  cd "$APP_DIR"
  docker build -t "$PANEL_IMAGE" .
  cat > /etc/systemd/system/dockio-panel.service <<EOF
[Unit]
Description=Dockio
After=network-online.target docker.service caddy.service
Wants=network-online.target

[Service]
Type=simple
ExecStartPre=-/usr/bin/docker rm -f dockio-panel
ExecStart=/usr/bin/docker run --rm --name dockio-panel --network host --pid host --privileged --env-file $ENV_DIR/panel.env -e DIO_HOST_NSENTER=true -v /var/run/docker.sock:/var/run/docker.sock -v $DATA_DIR:$DATA_DIR -v $ENV_DIR:$ENV_DIR:ro -v /etc/caddy:/etc/caddy -v /run/systemd:/run/systemd $PANEL_IMAGE
ExecStop=/usr/bin/docker stop dockio-panel
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
else
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
fi

systemctl daemon-reload
systemctl enable dockio-panel
systemctl restart dockio-panel

if [ "$ENABLE_UFW" != "false" ]; then
  ufw allow OpenSSH || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
  if [ -n "$TRUSTED_CIDR" ]; then
    ufw allow from "$TRUSTED_CIDR" to any port "$PANEL_PORT" proto tcp || true
  else
    ufw allow "$PANEL_PORT/tcp" || true
  fi
  ufw --force enable || true
fi

echo "Dockio installed."
echo "Install mode: $INSTALL_MODE"
echo "Open: http://SERVER_IP:$PANEL_PORT"
echo "First admin setup code: $SETUP_TOKEN"
echo "The setup code is stored in $ENV_DIR/panel.env as DIO_SETUP_TOKEN."
echo ""
echo "IMPORTANT BETA SECURITY WARNING"
echo "Dockio is currently beta software. Use it for testing and controlled VPS deployments."
echo "Create the admin account immediately, use a strong password, and keep the panel behind a trusted IP, VPN, or firewall rule."
echo "Do not expose the panel publicly unless you understand the risk and have restricted access."
echo ""
if [ "$ENABLE_UFW" != "false" ]; then
  if [ -n "$TRUSTED_CIDR" ]; then
    echo "Firewall enabled: SSH, 80/443, and panel port $PANEL_PORT from $TRUSTED_CIDR."
  else
    echo "Firewall enabled: SSH, 80/443, and public panel port $PANEL_PORT."
  fi
else
  echo "Firewall setup skipped because DIO_ENABLE_UFW=false."
fi
echo "If the panel port is public, create the admin account immediately and restrict firewall access."
