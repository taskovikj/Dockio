# Troubleshooting

## Panel Does Not Open

Check the service:

```bash
sudo systemctl status dockio-panel --no-pager -l
```

Check the port:

```bash
sudo ss -ltnp | grep 3099
```

Check logs:

```bash
sudo journalctl -u dockio-panel -n 200 --no-pager
```

## First Admin Setup Code

The installer prints the setup code. It is also stored in:

```bash
sudo grep DIO_SETUP_TOKEN /etc/dockio-panel/panel.env
```

## Caddy Route Fails

Validate Caddy:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl status caddy --no-pager -l
```

Make sure ports `80` and `443` are open.

## Preview Domain Does Not Work

Check:

- the service is running
- Caddy is active
- the preview route exists in `/etc/caddy/dockio/sites`
- ports `80` and `443` are open
- the panel service has the current sudoers rules

Re-run the installer if sudoers or systemd hardening changed.

## Git Deploy Fails

Check:

- repository URL is public HTTPS
- branch name is correct
- app directory is correct
- build command works locally
- Docker has enough disk space

Open the deployment logs from the service page.

## Docker Disk Space

From the panel, use Docker prune carefully. From SSH:

```bash
docker system df
docker system prune -af
```

Only prune when you understand that unused images/containers may be removed.

## Reset A Test Install

On a disposable VPS only:

```bash
sudo systemctl stop dockio-panel
sudo rm -rf /opt/dockio-panel /var/lib/dockio-panel /etc/dockio-panel
sudo rm -f /etc/systemd/system/dockio-panel.service /etc/sudoers.d/dockio-panel
sudo systemctl daemon-reload
```

This removes panel state and should not be used on a server with data you need.
