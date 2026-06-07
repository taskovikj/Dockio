# GitHub App Integration

Dockio can deploy public Git URLs without GitHub auth. For private GitHub repositories and push-to-deploy, connect a GitHub App from the **Git** page.

The recommended beta flow is **Connect GitHub**. Dockio creates a GitHub App from a manifest, GitHub redirects back to Dockio with a short-lived code, and Dockio stores the generated App credentials encrypted locally. Manual GitHub App setup is still available as an advanced fallback.

## What This Enables

- Sync GitHub App installations.
- List repositories the app can access.
- Pick a private or public repo in the deploy wizard.
- Pick a branch and app directory.
- Detect stack/build settings.
- Deploy manually from Dockio.
- Enable auto-deploy on GitHub push.
- Record webhook status and deployment history.

## Recommended Connect Flow

1. Open **Git** in the sidebar.
2. Confirm the **Dockio public URL**. For a public install this is usually `http://SERVER_IP:3099` for testing or an HTTPS admin domain for production.
3. Click **Connect GitHub**.
4. GitHub opens the App creation screen. Choose your personal account or organization.
5. Create the App, then install it on all repositories or selected repositories.
6. Back in Dockio, click **Refresh Installations**.
7. Choose the installation/account and click **Refresh Repositories**.
8. Deploy from a repository card or create a service with source **GitHub App**.

The manifest requests only repository **Contents: read-only**, **Metadata: read-only**, and the **Push** event. Push webhooks are ignored unless a service explicitly enables auto-deploy.

## Manual GitHub App Settings

Create a GitHub App in GitHub with these settings:

- Homepage URL: your Dockio URL, for example `https://panel.example.com`.
- Webhook URL: `https://YOUR_PUBLIC_DOCKIO_URL/api/webhooks/github`.
- Webhook secret: generate a long random value and save the same value in Dockio.
- Repository permissions:
  - Contents: read-only
  - Metadata: read-only
- Subscribe to events:
  - Push

Optional fields such as Client ID and Client Secret can be stored in Dockio, but they are not required for the current manual deploy flow.

## Public URL Requirement

Manual deploys only need Dockio to reach GitHub.

Auto-deploy requires GitHub to reach Dockio, so the panel needs a public HTTPS URL:

```txt
https://panel.example.com
```

Do not use `localhost` or a private Tailscale-only URL for GitHub webhooks. GitHub cannot reach those.

If you do not want the panel broadly public, put it behind a restrictive firewall, reverse proxy access control, or a private admin domain. The webhook endpoint itself is unauthenticated but requires a valid GitHub HMAC signature.

## Manual Dockio Setup

1. Open **Git** in the sidebar.
2. Open **Manual GitHub App setup fallback**.
3. Fill:
   - Connection name
   - GitHub App ID
   - Private key PEM
   - Webhook secret
   - Public Dockio URL
   - Optional App URL and Install URL
4. Click **Save Manual App**.
5. Click **Refresh Installations**.
6. Install the GitHub App on at least one repository if no installations appear.
7. Select an installation/account.
8. Click **Refresh Repositories**.
9. Use repository cards or the deployment wizard to deploy.

## Deploy A Private Repo

1. Create or open a project.
2. Click **Create Service**.
3. Source: **GitHub App**.
4. Select connection, installation/account, repository, branch, and optional root directory.
5. Click **Detect Stack**.
6. Confirm build mode:
   - generated Dockerfile
   - repo Dockerfile
   - static build
7. Add env vars and optional database.
8. Enable auto preview domain if you want a Caddy preview URL.
9. Enable auto-deploy if you configured a public HTTPS Dockio URL and GitHub webhook.
10. Deploy.

Dockio generates a short-lived GitHub installation token during sync/detect/deploy. It is passed to Git through a temporary `GIT_ASKPASS` helper and is not stored permanently or written into the Git remote URL.

## Auto-Deploy

When GitHub sends a push webhook:

1. Dockio reads the raw body.
2. Dockio verifies `X-Hub-Signature-256` with the encrypted webhook secret.
3. Only `push` events are accepted.
4. Dockio matches services by repository, installation, and branch.
5. Matching services are queued for redeploy.
6. Deployment history records `trigger: webhook` and `provider: github_app`.

Branch mismatches and repos with no matching service are recorded as ignored webhook events.

## Secret Storage

Dockio encrypts GitHub private keys, webhook secrets, and optional client secrets with AES-256-GCM.

By default the local encryption key is stored under the Dockio secrets directory in the data path. On installed servers that is normally:

```txt
/var/lib/dockio-panel/secrets/dockio-secret.key
```

Back up this key with your Dockio data. Losing it means encrypted GitHub secrets must be re-saved.

## Troubleshooting

Invalid App ID:
Use the numeric GitHub App ID, not the app slug.

Invalid private key:
Paste the full PEM, including `BEGIN` and `END` lines. Escaped `\n` strings are also accepted.

No installations:
Install the GitHub App on your user/org and select at least one repository.

No repositories:
Refresh repositories after installing the app. Archived or disabled repos cannot deploy.

Webhook 401:
The webhook secret in GitHub and Dockio do not match, or the signature header is missing.

Webhook ignored:
The push event did not match a GitHub App service with auto-deploy enabled on the pushed branch.

Manual deploy works but auto-deploy does not:
Check that the public Dockio URL is HTTPS and reachable by GitHub, and that the webhook URL is exactly `/api/webhooks/github`.
