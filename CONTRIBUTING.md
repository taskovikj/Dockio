# Contributing

Dockio is a beta VPS deployment panel. Contributions are welcome, especially focused fixes that improve real deployment flows.

## Local Setup

```bash
corepack enable
pnpm install
DIO_DATA_DIR=.data-dockio-panel pnpm dev
```

Run before opening a PR:

```bash
pnpm typecheck
pnpm build
```

## Pull Requests

- Keep changes focused.
- Include the deployment path you tested.
- Add screenshots for UI changes.
- Update docs when behavior changes.
- Keep local state, generated builds, and logs out of commits.

Useful areas:

- framework detection
- deployment error messages
- GitHub App flow
- domain/DNS UX
- database backup/restore
- Compose support
- accessibility and responsive UI
- tests for validation, GitHub, and deployment planning

## Project Style

- Prefer simple working flows over broad rewrites.
- Keep server actions allowlisted and explicit.
- Keep app/container defaults conservative.
- Preserve the single-VPS install path.
