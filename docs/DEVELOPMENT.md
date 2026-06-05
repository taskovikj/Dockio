# Development

## Setup

```bash
corepack enable
pnpm install
cp .env.example .env.local
SVP_DATA_DIR=.data-supavibe-panel pnpm dev
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

Local state lives under `SVP_DATA_DIR`.

Default local folders are ignored by git:

- `.data-supavibe-panel`
- `.data-local`

Do not commit:

- `.next`
- `node_modules`
- logs
- local data
- setup codes
- generated secrets

## Coding Guidelines

- Validate API input with Zod.
- Use helpers from `app/lib/validate.ts` before using user-controlled IDs, paths, ports, domains, names, and env keys.
- Redact command output before storing or returning it.
- Keep server actions allowlisted.
- Do not add arbitrary shell execution endpoints.
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
