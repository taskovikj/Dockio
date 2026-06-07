# Development

## Setup

```bash
corepack enable
pnpm install
cp .env.example .env.local
DIO_DATA_DIR=.data-dockio-panel pnpm dev
```

Open:

```txt
http://localhost:3000
```

## Scripts

```bash
pnpm typecheck
pnpm build
pnpm clean
pnpm clean -- --deps
```

## Local State

Local state lives under `DIO_DATA_DIR`.

Default local folders are ignored by git:

- `.data-dockio-panel`
- `.data-local`

## Coding Guidelines

- Validate API input with Zod.
- Use helpers from `app/lib/validate.ts` before using user-controlled IDs, paths, ports, domains, names, and env keys.
- Redact command output before storing or returning it.
- Keep server actions allowlisted.
- Keep app containers unprivileged.
- Keep public app traffic through Caddy.

## UI Guidelines

- Keep workflows project-focused.
- Prefer clear actions over placeholder screens.
- Avoid adding fake metrics or inactive controls.
- Make errors actionable and specific.
- Keep buttons compact and consistent.

## Testing Changes

Before opening a PR:

```bash
pnpm typecheck
pnpm build
```

For deployment-related changes, test on a disposable VPS when possible.
