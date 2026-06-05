# Roadmap

Dockio Panel is in beta. This roadmap describes the intended direction, not guaranteed release dates.

## Current Focus

- Make public Git deploys reliable.
- Improve stack detection.
- Improve preview/domain setup.
- Make logs and errors easier to understand.
- Keep the self-hosted install simple.
- Keep safety defaults strict.

## Near-Term

- SQLite state with migrations.
- Background jobs for long operations.
- Live deployment logs.
- Live runtime log streaming.
- Backup and restore for managed Postgres.
- Better DNS checks and HTTPS status.
- More framework detection.
- Better cleanup of old images, releases, and logs.
- Tests for validation, redaction, and deploy planning.

## Later

- Private Git provider integration.
- GitHub App/OAuth flow.
- Multi-user support and roles.
- Resource limits per service.
- Scheduled backups.
- External object storage for backups.
- More non-Docker deployment options.
- Hosted control-plane option.
- Optional provider provisioning.

## Not Planned For Beta

- Billing.
- Hosted multi-tenant SaaS.
- Public webhook deploy triggers enabled by default.
- Running untrusted Compose files without warnings.
- Arbitrary web terminal access.
