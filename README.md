<p align="center">
  <img src="public/logo.svg" alt="Dockio" width="96" />
</p>

# Dockio

Self-hosted VPS deployment panel for teams and solo developers who want a simple way to run apps on their own server.

Dockio is currently a public beta. It is being actively developed and tested on real VPS deployments.

Website: `dockio.dev`  
Repository: `github.com/taskovikj/Dockio`

## What It Does

Dockio installs on a Linux VPS and gives you a web dashboard for:

- deploying public Git repositories
- deploying private GitHub repositories through a GitHub App
- deploying Docker images
- deploying Docker Compose stacks
- detecting Node, Next.js, Vite/static, Dockerfile, and Compose projects
- creating Caddy preview URLs
- adding custom domains through Caddy
- managing Postgres and Redis containers
- storing external Postgres connection records
- editing environment variables
- viewing runtime logs and deployment history
- restarting, stopping, redeploying, and deleting services
- viewing UFW status, exposed ports, numbered rules, and applying firewall changes
- inspecting Docker resources and pruning managed resources

Dockio is intentionally single-server first. The installed panel, state, Docker, Caddy, apps, databases, logs, and generated routes all live on the same VPS.

## Install

Run on Ubuntu 22.04/24.04, Debian 12, or a compatible VPS:

```bash
curl -fsSL https://dockio.dev/install.sh | sudo bash
```

Open:

```txt
http://YOUR_SERVER_IP:3099
```

The installer prints a first-admin setup code. It is also stored in:

```txt
/etc/dockio-panel/panel.env
```

Dockio installs:

- Docker and Docker Compose plugin
- Caddy
- Node.js 22 if missing
- pnpm through Corepack
- `dockio-panel` systemd service
- a dedicated `dockio` runtime user
- narrow sudoers rules for UFW, Caddy, and Dockio-managed systemd services
- a default UFW baseline: SSH, 80/443, and the panel port

## Install Options

Restrict the panel port to a private/VPN CIDR:

```bash
curl -fsSL https://dockio.dev/install.sh \
  | sudo env PANEL_PORT=3099 PANEL_HOST=0.0.0.0 TRUSTED_CIDR=100.64.0.0/10 bash
```

Install from a local clone:

```bash
git clone https://github.com/taskovikj/Dockio.git dockio
cd dockio
sudo bash scripts/install.sh
```

Install a fork:

```bash
curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/scripts/install-from-github.sh \
  | sudo env REPO_URL=https://github.com/<owner>/<repo>.git bash
```

GitHub-hosted installer fallback:

```bash
curl -fsSL https://raw.githubusercontent.com/taskovikj/Dockio/main/scripts/install-from-github.sh | sudo bash
```

Useful installer variables:

```bash
PANEL_PORT=3099
PANEL_HOST=0.0.0.0
TRUSTED_CIDR=100.64.0.0/10
DIO_ENABLE_UFW=true
DIO_KEEP_DEV_DEPS=false
```

Set `TRUSTED_CIDR` to restrict the panel port to a VPN/Tailscale range or your own IP. Set `DIO_ENABLE_UFW=false` only when another firewall manager is already controlling the server.

## First Deploy

1. Create the admin account with the setup code.
2. Open **Firewall** and review the active UFW rules.
3. Create a project.
4. Click **Create Service**.
5. Choose a source:
   - Public Git
   - GitHub App
   - Docker image
   - Compose from Git
   - Compose YAML
6. Confirm detected build/runtime settings.
7. Add env vars and optional database.
8. Deploy.
9. Open the preview URL or add a custom domain.

## GitHub App

Dockio supports a guided GitHub App connection for private repositories.

1. Open **Git**.
2. Set the Dockio public URL.
3. Click **Connect GitHub**.
4. Create/install the generated GitHub App.
5. Return to Dockio.
6. Click **Refresh Installations**.
7. Select an installation and click **Refresh Repositories**.
8. Deploy from the selected repository.

The GitHub App requests read-only repository contents and metadata. Push events are used only by services that explicitly enable auto-deploy.

See [docs/GITHUB_APP.md](docs/GITHUB_APP.md).

## Runtime Layout

```txt
/opt/dockio-panel/app                 application code
/var/lib/dockio-panel                 state, apps, logs, temp files, encrypted local data
/etc/dockio-panel/panel.env           service configuration
/etc/caddy/conf.d                     custom domain routes
/etc/caddy/dockio/sites               preview routes
```

## Development

```bash
corepack enable
pnpm install
DIO_DATA_DIR=.data-dockio-panel pnpm dev
```

Open:

```txt
http://localhost:3000
```

Checks:

```bash
pnpm typecheck
pnpm build
pnpm clean
```

## Repository Layout

```txt
app/                     Next.js app, API routes, UI, server-side operations
app/lib/                 auth, state, GitHub, validation, runtime helpers
scripts/install.sh       VPS installer
scripts/install-from-github.sh
scripts/clean-local.mjs
docs/
```

## Beta Scope

Available now:

- public Git deploys
- GitHub App private repo deploys
- Docker image deploys
- Compose deploys
- Caddy preview domains
- custom domains
- managed Postgres and Redis
- runtime logs and service controls
- firewall helpers

Still evolving:

- database backup/restore workflow
- richer DNS validation
- project-level deployment jobs
- RBAC/team model
- hosted control-plane architecture
- broader framework detection

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md).

## License

MIT.
