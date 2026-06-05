# Security Policy

Supavibe Panel is beta software. Please test it carefully and avoid using it for sensitive production workloads until the project reaches a stable release.

## Supported Versions

Only the `main` branch is currently maintained during beta.

## Reporting Security Issues

Please do not post public issues containing:

- API tokens
- private keys
- setup codes
- database URLs
- passwords
- server IPs you want private
- screenshots with secrets

If you find a vulnerability, open a minimal public issue that says a security report is available, or contact the maintainer through the private channel listed by the repository owner. Include enough detail to reproduce the issue, but redact secrets.

## Security Boundaries

Supavibe Panel is designed to manage one VPS where it is installed.

Current boundaries:

- Admin authentication is required after first setup.
- Mutating requests require CSRF validation.
- Login and sensitive actions are rate limited.
- Server operations are allowlisted; there is no arbitrary shell endpoint.
- App containers should not be privileged.
- App containers should not mount the Docker socket.
- App containers should bind to localhost unless explicitly configured otherwise.
- Public app ingress should go through Caddy on ports `80` and `443`.
- Command output and API responses are redacted before being shown in the UI.

## Known Beta Risks

- Local state is stored in JSON files, not a hardened database.
- The panel has one admin account and no RBAC yet.
- Git build scripts and Compose files execute on the VPS. Only deploy trusted sources.
- The sudoers allowlist is intentionally narrow, but it still grants the panel controlled root actions for UFW, Caddy, and systemd.
- Private Git provider authentication is not implemented yet.

## Recommended Deployment For Testing

- Use a fresh disposable VPS.
- Restrict the panel port to your IP or VPN.
- Keep public app traffic on `80` and `443`.
- Do not paste real production secrets into test services.
- Rotate any credentials that accidentally appear in logs or screenshots.
