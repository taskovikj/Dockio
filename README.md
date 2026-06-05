# Dockio Panel

> Public beta. This project is actively being built and tested. Some features work today, some are incomplete, and the API/state model may change before a stable release.

Dockio Panel is a self-hosted VPS control panel for deploying and managing apps on a single Linux server. It is meant to feel simpler than a full server control panel while still giving developers practical deployment tools: Git deploys, Docker image deploys, Compose stacks, Caddy routes, firewall helpers, logs, managed databases, and runtime controls.

Project domain: `dockio.dev`.

The current version is intended for test VPSs, homelab servers, prototypes, and early feedback. Do not treat it as a finished production platform yet.

## Status

Dockio Panel is currently in beta/WIP:

- UI and workflows are still changing.
- State is stored in local JSON files for now.
- Public Git deploys work first; private Git provider auth is not implemented yet.
- Some production features such as backup/restore, RBAC, teams, and hosted control-plane mode are planned but not finished.
- Security defaults are intentionally conservative, but you should still install it behind a firewall or VPN while testing.

## Features Available To Test

- First-run admin setup with a one-time setup code.
- Login/logout with HTTP-only session cookies and CSRF protection.
- Server overview: OS, disk, memory, Docker, Caddy, UFW, public IP.
- Deploy from a public Git repository:
  - repo `Dockerfile`
  - generated Node/Next/Vite Dockerfile
  - static build served through Caddy/nginx
- Deploy an existing Docker image.
- Deploy Docker Compose from Git or pasted Compose YAML.
- Auto preview domains through Caddy using `sslip.io` or a custom wildcard domain.
- Custom domain routing with Caddy.
- Managed Postgres and Redis containers.
- External Postgres connection records.
- Environment variable management.
- Runtime logs, health checks, restart, stop, redeploy, and delete.
- UFW firewall baseline and rule helper.
- Deployment history and audit log.
- Docker system prune from the dashboard.

## Safety Model

Dockio Panel is not a web terminal and does not expose arbitrary shell execution. Server actions are implemented as allowlisted operations.

Important defaults:

- App containers bind to `127.0.0.1` unless an explicit debug port is enabled.
- Public app traffic should go through Caddy on ports `80` and `443`.
- App containers do not mount the Docker socket.
- App containers are not privileged.
- Domains, ports, app IDs, Docker names, CIDRs, env keys, and managed paths are validated.
- Command output and API responses redact common secrets, tokens, database URLs, Authorization headers, private keys, and credentialed clone URLs.
- The installer creates a dedicated runtime user and narrow sudoers rules for UFW, Caddy, and `dio-*` systemd services.

Still, Git builds and Compose files run code on your VPS. Only deploy repositories and images you trust.

## Requirements

Recommended test server:

- Ubuntu 22.04/24.04 or Debian 12
- 2 GB RAM minimum, 4 GB recommended
- Root access or a sudo user
- Public ports `80` and `443` open for app domains
- Panel port restricted to your IP or VPN where possible

The installer installs:

- Docker
- Docker Compose plugin
- Caddy
- Node.js 22 if missing
- pnpm through Corepack
- Dockio Panel systemd service

## Quick Install

Run this on a fresh Ubuntu/Debian VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/taskovikj/supavibe-panel/main/scripts/install-from-github.sh | sudo bash
```

The product installs as Dockio Panel, but the current source repository is still `taskovikj/supavibe-panel`.

The default panel port is:

```txt
3099
```

Then open:

```txt
http://YOUR_SERVER_IP:3099
```

The installer prints a first-admin setup code and stores it in:

```txt
/etc/dockio-panel/panel.env
```

Use that code on the first screen to create the admin account.

If the panel port is public, create the admin account immediately and restrict access in **Firewall & Server**.

## Install With A Custom Port Or VPN CIDR

Example with the panel restricted to a VPN/private CIDR:

```bash
curl -fsSL https://raw.githubusercontent.com/taskovikj/supavibe-panel/main/scripts/install-from-github.sh \
  | sudo env PANEL_PORT=3099 PANEL_HOST=0.0.0.0 TRUSTED_CIDR=100.64.0.0/10 bash
```

## Install A Fork

If you fork this beta and want the installer to pull your fork, pass `REPO_URL`:

```bash
curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/scripts/install-from-github.sh \
  | sudo env REPO_URL=https://github.com/<owner>/<repo>.git bash
```

## Install From A Local Clone

```bash
git clone https://github.com/taskovikj/supavibe-panel.git dockio-panel
cd dockio-panel
sudo bash scripts/install.sh
```

For a fork:

```bash
git clone https://github.com/<owner>/<repo>.git dockio-panel
cd dockio-panel
sudo bash scripts/install.sh
```

Useful installer variables for local/manual installs:

```bash
sudo PANEL_PORT=3099 PANEL_HOST=0.0.0.0 TRUSTED_CIDR=100.64.0.0/10 bash scripts/install.sh
```

Set `DIO_KEEP_DEV_DEPS=true` only if you need to debug/build inside `/opt/dockio-panel/app`. By default the installer builds the app, prunes development dependencies, and removes rebuildable Next.js caches to reduce disk usage.

## Basic Usage

1. Open the panel URL.
2. Create the first admin account with the setup code.
3. Open **Firewall & Server** and apply a safe firewall baseline.
4. Create a project.
5. Open the project and create a service.
6. Choose a source:
   - public Git repository
   - Docker image
   - Docker Compose
7. Confirm detected build settings.
8. Add env vars and optional database resources.
9. Deploy.
10. Open the generated preview URL or add a custom domain.

## Development

```bash
pnpm install
DIO_DATA_DIR=.data-dockio-panel pnpm dev
```

Open:

```txt
http://localhost:3000
```

Useful commands:

```bash
pnpm typecheck
pnpm build
pnpm clean
pnpm clean -- --deps
```

## Repository Layout

```txt
app/                     Next.js app, API routes, UI, server actions
app/lib/                 auth, state, validation, system operations
scripts/install.sh       VPS installer
scripts/install-from-github.sh
scripts/clean-local.mjs  local cache cleanup
docs/                    project documentation
```

## Data Layout On Installed Servers

```txt
/opt/dockio-panel/app       app code
/var/lib/dockio-panel       state, app data, logs, temp files, secrets
/etc/dockio-panel/panel.env service config
/etc/caddy/conf.d             generated custom domain routes
/etc/caddy/dockio/sites     generated preview routes
```

## Contributing

Contributions are welcome while the project is in beta. Good first contributions include:

- bug reports with logs and screenshots
- deploy tests against different app frameworks
- better error messages
- documentation fixes
- UI/UX improvements
- safer deployment defaults

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Security

Please do not open public issues with real tokens, private keys, database URLs, server IPs you want private, or credentials. See [SECURITY.md](SECURITY.md).

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).

## License

MIT. See [LICENSE](LICENSE).
