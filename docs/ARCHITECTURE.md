# Architecture

Supavibe Panel is currently a single-server, self-hosted control panel.

## High-Level Model

```txt
Browser
  |
  | HTTP panel port
  v
Next.js app on the VPS
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
- **JSON state**: local beta state storage under `SVP_DATA_DIR`.
- **Docker**: app containers, Compose stacks, managed Postgres, managed Redis.
- **Caddy**: HTTPS reverse proxy and preview/custom domain routing.
- **UFW**: firewall baseline and simple port rules.
- **systemd**: panel service and future managed services.

## Installed Server Layout

```txt
/opt/supavibe-panel/app
  Installed app source and production build.

/var/lib/supavibe-panel
  Local JSON state, generated app data, logs, temp files, and secrets.

/etc/supavibe-panel/panel.env
  Service environment.

/etc/caddy/conf.d
  Custom domain Caddy route files.

/etc/caddy/supavibe/sites
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
