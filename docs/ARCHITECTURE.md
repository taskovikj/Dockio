# Architecture

Dockio is currently a single-server, self-hosted control panel.

## High-Level Model

```txt
Browser
  |
  | HTTP panel port
  v
Dockio panel container on the VPS
  |
  | allowlisted server actions
  v
Docker / Caddy / UFW / systemd / local files
  |
  v
Deployed apps, databases, domains, logs
```

There is no separate remote agent in this repo. The panel is installed directly on the VPS it manages.

## Runtime Components

- **Next.js App Router**: UI and API route handling.
- **Dockerized panel**: default install runs the panel as a Docker container managed by systemd.
- **JSON state**: local beta state storage under `DIO_DATA_DIR`.
- **Docker**: app containers, Compose stacks, managed Postgres, managed Redis.
- **Nixpacks**: optional Git build mode for normal app repos without a Dockerfile.
- **Caddy**: HTTPS reverse proxy and preview/custom domain routing.
- **UFW**: firewall baseline and simple port rules.
- **systemd**: keeps the panel container alive; host mode can run the panel directly as a Node service.

## Installed Server Layout

```txt
/opt/dockio-panel/app
  Installed app source used to build the local panel image.

/var/lib/dockio-panel
  Local JSON state, generated app data, logs, temp files, and secrets.

/etc/dockio-panel/panel.env
  Service environment.

/etc/caddy/conf.d
  Custom domain Caddy route files.

/etc/caddy/dockio/sites
  Auto preview domain Caddy route files.
```

## Request Flow

1. Browser calls `/api/...`.
2. API route checks trusted network settings, auth, CSRF, and rate limits.
3. Request body is validated with Zod.
4. System action validates IDs, paths, domains, ports, names, and env keys.
5. The action runs an allowlisted command or writes a managed file.
6. Output is redacted before being stored or returned.
7. State and audit events are updated.

## Panel Container Boundary

The default installer runs Dockio as a container but the panel still manages the VPS host. To do that it mounts persistent state, Caddy config, and the Docker socket, then uses an explicit host namespace mode for UFW/Caddy/systemd operations. Treat panel admin access like root access to the VPS.

Set `DIO_INSTALL_MODE=host` during install if you prefer the previous host Node/systemd process with sudoers instead of the panel container.

## Current Storage

State is JSON-based for beta simplicity. This will likely move to SQLite before a stable release.

Current state includes:

- admin account metadata
- sessions
- projects
- apps/services
- database resources
- deployment events
- audit events
- preview/domain settings

## Future Direction

Planned architecture work:

- SQLite migrations
- background jobs
- streaming logs
- private Git provider auth
- backup/restore
- multi-user/RBAC
- optional hosted control plane
- safer app templates and deployment strategies
