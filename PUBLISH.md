# Publish Supavibe Panel As A Separate GitHub Repo

This folder is standalone. It does not need the old monorepo, old dashboard, or old agent.

## Recommended Repo

Create a new GitHub repo named:

```txt
supavibe-panel
```

The installer defaults to:

```txt
https://github.com/taskovikj/supavibe-panel.git
```

If you use a different GitHub repo name, update `REPO_URL` in `scripts/install-from-github.sh` or install with:

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/scripts/install-from-github.sh | sudo env REPO_URL=https://github.com/YOUR_USER/YOUR_REPO.git bash
```

## Push Commands

From this folder:

```bash
git remote add origin https://github.com/taskovikj/supavibe-panel.git
git push -u origin main
```

## One-Command Install After Pushing

```bash
curl -fsSL https://raw.githubusercontent.com/taskovikj/supavibe-panel/main/scripts/install-from-github.sh | sudo bash
```

Tailscale/private port:

```bash
curl -fsSL https://raw.githubusercontent.com/taskovikj/supavibe-panel/main/scripts/install-from-github.sh | sudo env PANEL_PORT=3111 PANEL_HOST=0.0.0.0 TRUSTED_CIDR=100.64.0.0/10 bash
```
