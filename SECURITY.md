# Security

Dockio is beta software. The current release is designed for a single self-hosted VPS and should be evaluated before use on sensitive production workloads.

## Model

- Admin authentication is required after first setup.
- Mutating requests use CSRF protection.
- Sensitive actions are rate limited.
- Server operations are allowlisted; Dockio is not a browser shell.
- App containers are not privileged by default.
- App containers do not mount the Docker socket.
- Public app traffic is intended to go through Caddy on ports `80` and `443`.
- GitHub App credentials and stored connection URLs are encrypted locally.
- Command output is redacted before it is stored or returned to the UI.
- The default panel container has host-management access so it can control Docker, Caddy, UFW, and systemd on the VPS.

## Current Boundaries

- One VPS.
- One admin account.
- Local JSON state.
- Controlled sudoers entries for UFW, Caddy, and `dio-*` systemd services.
- Git builds and Compose files execute on the managed VPS.
- Dockerized panel mode uses the Docker socket and host namespace access. Treat Dockio admin access as equivalent to VPS administrator access.

## Reporting

Use the repository issue tracker for normal bugs. For security reports, contact the maintainer through the private channel listed by the repository owner or open a minimal issue requesting a private disclosure path.
