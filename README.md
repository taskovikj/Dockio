# Supavibe Panel

Supavibe Panel is a self-hosted single-server dashboard. It is installed directly on a user-owned VPS and manages that same VPS.

## What It Does Now

- First-run admin setup and login.
- Server status: OS, disk, memory, Docker, Caddy, UFW, public IP.
- Safe allowlisted actions only; no arbitrary shell endpoint.
- Sample Docker deployment.
- Sample no-Docker systemd deployment.
- Sample static deployment served through Caddy after domain setup.
- Caddy domain configuration.
- Firewall baseline helper.
- Logs for Docker/systemd apps.
- Audit events.

## Install

For normal users, the install should be one command on a fresh Ubuntu/Debian VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/taskovikj/supavibe-panel/main/scripts/install-from-github.sh | sudo bash
```

Recommended private/VPN install, for example Tailscale-only panel access:

```bash
curl -fsSL https://raw.githubusercontent.com/taskovikj/supavibe-panel/main/scripts/install-from-github.sh | sudo env PANEL_PORT=3111 PANEL_HOST=0.0.0.0 TRUSTED_CIDR=100.64.0.0/10 bash
```

Then open:

```txt
http://YOUR_SERVER_IP:3111
```

The installer prints a one-time first-admin setup code and stores it in:

```txt
/etc/supavibe-panel/panel.env
```

Use that setup code on the first screen. This prevents a random internet visitor from creating the first admin account before you.

If you already cloned the repository on the VPS, you can run the inner installer from the repository root:

```bash
sudo bash scripts/install.sh
```

Useful install env:

```bash
sudo PANEL_PORT=3099 PANEL_HOST=0.0.0.0 TRUSTED_CIDR=100.64.0.0/10 bash scripts/install.sh
```

If the panel is public, keep auth enabled and restrict the panel port by firewall. For Tailscale installs, use `TRUSTED_CIDR=100.64.0.0/10`.

## Simplest Product Install Flow

The product should expose this as:

1. User buys a VPS with Ubuntu 24.04.
2. User SSHs into the VPS as root or a sudo user.
3. User runs the one-line installer.
4. Installer installs Docker, Caddy, Node, pnpm, and the panel service.
5. User opens the panel URL.
6. First screen forces admin account creation.
7. Panel shows a safety warning if the port is public.
8. User applies firewall baseline, then deploys sample Docker, systemd, or static apps.

This is intentionally easier than asking users to clone the repo, install pnpm, build manually, and create systemd files themselves.

## Manual Dev Run

```bash
pnpm install
SVP_DATA_DIR=.data-supavibe-panel pnpm --filter @supavibe/vps-panel dev
```

Open `http://localhost:3000`.

## Production Layout

```txt
/opt/supavibe-panel/app       app code
/var/lib/supavibe-panel       JSON state, generated apps, temp files
/etc/supavibe-panel/panel.env service config
/etc/caddy/conf.d             generated Caddy routes
```

## Security Model

- Admin auth is required after first-run setup.
- Installed servers require a first-admin setup code from `/etc/supavibe-panel/panel.env`.
- Passwords must be at least 12 characters with uppercase, lowercase, and a number.
- Session cookies are HTTP-only and SameSite strict.
- Mutating API requests require a per-session CSRF token.
- Login, setup, firewall, and deploy actions have basic rate limits.
- API errors are structured and include request IDs.
- The install-time `TRUSTED_CIDR` value is enforced with UFW firewall rules. The optional app-level `SVP_TRUSTED_NETWORK_ONLY=true` guard should only be enabled behind a proxy that forwards real client IP headers.
- App containers bind only to `127.0.0.1`.
- No-Docker/systemd sample apps bind only to `127.0.0.1`.
- Public app ingress is through Caddy on 80/443.
- No Docker socket is mounted into app containers.
- No privileged app containers.
- Docker sample apps run with dropped Linux capabilities, no-new-privileges, memory/CPU/pid limits, read-only filesystem, and tmpfs `/tmp`.
- System actions are allowlisted in code and use specific commands.
- Domains, CIDRs, app IDs, service names, Docker names, ports, and managed paths are validated before use.
- Command output and API errors redact common tokens, passwords, database URLs, Authorization headers, private keys, and credentialed clone URLs.
- The installer adds narrowed sudoers entries for UFW, Caddy validation/reload, `svp-*` systemd services, and generated Caddy/systemd files.

## Known Prototype Limits

- JSON file state instead of SQLite.
- No multi-user/RBAC yet.
- Sudoers rules are narrowed for the prototype, but should be reviewed per distribution before real production.
- Deployments are samples, not arbitrary repo deploys yet.
- Static apps require a domain to be public through Caddy.
- No backup/restore for app data yet.
