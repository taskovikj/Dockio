# Usage Guide

This guide assumes Dockio is installed on a test VPS.

## First Run

1. Open the panel URL printed by the installer.
2. Copy the first-admin setup code from the installer output or from `/etc/dockio-panel/panel.env`.
3. Create the admin account.
4. Log in.

If the panel port is reachable from the internet, restrict it with firewall rules.

## Create A Project

Projects group related services, domains, databases, env vars, logs, and deployment history.

1. Open **Projects Home**.
2. Create a project.
3. Open the project.

## Deploy From Public Git

1. Open a project.
2. Click **Create Service**.
3. Choose **Application**.
4. Enter:
   - service name
   - role: frontend, backend, worker, or full-stack
   - public repository URL
   - branch
   - optional root directory
5. Click **Detect Stack**.
6. Confirm the detected service.
7. Review:
   - build mode
   - build command
   - start command
   - container port
   - health path
8. Add environment variables.
9. Choose whether to create an auto preview domain.
10. Deploy.

## Deploy A Docker Image

1. Open a project.
2. Click **Create Service**.
3. Choose **Docker Image**.
4. Enter the image name, for example `nginx:1.27-alpine`.
5. Set the container port.
6. Add env vars if needed.
7. Deploy.

## Deploy Compose

Use Compose only with repositories you trust.

Supported flows:

- clone a public Git repo containing `docker-compose.yml` or `compose.yaml`
- paste a small Compose YAML file

Compose files may expose ports if the file says so. Review them before deploying.

## Add A Managed Database

1. Open a project.
2. Open **Storage**.
3. Create Managed Postgres or Managed Redis.
4. Attach the resource to a service.
5. Redeploy the service so the env var is available at runtime.

## Add A Domain

1. Point an `A` record at the VPS public IP.
2. Open the project or service.
3. Open **Domains**.
4. Select a service.
5. Enter the domain.
6. Configure Caddy.
7. Wait for DNS and certificate issuance.

Caddy handles HTTPS automatically when DNS points to the VPS and ports `80` and `443` are open.

## Preview URLs

Dockio can create preview hostnames using:

- `sslip.io`
- a custom wildcard preview domain

The preview route points to a private localhost app port through Caddy.

## Logs And Runtime Actions

Each service can:

- show logs
- run health checks
- restart
- stop
- start
- redeploy
- delete

Deployment records can be deleted separately from running services.
