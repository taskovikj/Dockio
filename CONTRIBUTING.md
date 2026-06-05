# Contributing To Supavibe Panel

Thanks for helping test and improve Supavibe Panel. This repository is a beta project, so clear bug reports and small focused fixes are especially valuable.

## Before You Start

- Do not include real API keys, private keys, database URLs, passwords, or production server details in issues, screenshots, commits, or pull requests.
- Test on disposable VPSs where possible.
- Keep pull requests focused. One feature or fix per PR is easiest to review.
- Prefer simple working flows over large rewrites.

## Local Development

Requirements:

- Node.js 22+
- pnpm through Corepack
- Docker if you want to test deployment actions locally

```bash
corepack enable
pnpm install
SVP_DATA_DIR=.data-supavibe-panel pnpm dev
```

Open:

```txt
http://localhost:3000
```

Useful checks:

```bash
pnpm typecheck
pnpm build
pnpm clean
```

## Pull Request Checklist

- Explain what changed and why.
- Mention what you tested.
- Add screenshots for UI changes.
- Update docs when behavior changes.
- Do not commit local data directories, `.next`, `node_modules`, logs, or generated secrets.
- Do not add arbitrary shell execution endpoints.
- Do not weaken auth, CSRF, validation, or redaction without discussing it first.

## Areas That Need Help

- Framework detection for more app types.
- Better deployment error messages.
- Domain and DNS validation UX.
- Database backup/restore.
- Safer Compose handling and clearer warnings.
- UI polish and accessibility.
- Tests for validation and redaction helpers.

## Reporting Bugs

Please include:

- Supavibe Panel version or commit SHA.
- VPS OS and version.
- Install method.
- What you clicked or ran.
- Expected result.
- Actual result.
- Redacted logs or screenshots.

Use placeholders such as `example.com`, `YOUR_SERVER_IP`, and `[redacted]` for sensitive values.
