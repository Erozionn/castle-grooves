# Castle Grooves Production Deployment Guide

Production deployment uses GitHub Actions to build and publish Docker images to Docker Hub. The production Compose stack runs Watchtower so the bot container updates automatically when a new image is published.

## How It Works

1. Push to `main` or `master` for production, or `develop` for the development image.
2. GitHub Actions runs the backend test suite before publishing `${DOCKER_HUB_USERNAME}/castle-grooves:latest` and the matching UI image.
3. Watchtower checks Docker Hub every 5 minutes.
4. Watchtower replaces the bot and dashboard containers when newer images are available.

## GitHub Setup

Add these repository secrets under Settings > Secrets and variables > Actions:

- `DOCKER_HUB_USERNAME`
- `DOCKER_HUB_ACCESS_TOKEN`

The backend and UI workflows publish:

- `latest` for `main`
- `dev` for `develop`
- semver tags for `v*` tags

## Server Setup

```bash
git clone <your-repo-url>
cd castle-grooves
cp .env.example .env
nano .env
```

Set the production values in `.env`, including:

```bash
DOCKER_HUB_USERNAME=your-dockerhub-username
WEBSERVER_PORT=1337
```

## React dashboard and Discord login

The production Compose overlay pulls `${DOCKER_HUB_USERNAME}/castle-grooves-ui:latest` as the `dashboard` service. It serves the React application and proxies `/api/v1/`, `/ws`, `/auth/`, and `/healthz` to the internal bot service. Point the external HTTPS reverse proxy at the dashboard service on `DASHBOARD_PORT`; it is the single public origin.

Set all dashboard variables in `.env`: `DASHBOARD_PUBLIC_URL`, Discord OAuth
client ID/secret/redirect URI, `DASHBOARD_SESSION_SECRET`, and at least one
dashboard role allowlist. `ADMIN_USER_ID` remains the legacy `/play` playback
identity; it does not grant dashboard access.

In the Discord Developer Portal, open the application's **OAuth2** settings
and add the exact redirect URI:

```text
https://castle-grooves.lan/auth/discord/callback
```

Use the exact value configured as `DISCORD_OAUTH_REDIRECT_URI`; Discord rejects
near-matches. The OAuth scope required by this backend is `identify` only.

The dashboard uses secure HTTP-only session cookies. Do not expose the bot,
Lavalink, InfluxDB, OAuth secret, or session secret directly to the browser.
Production is same-origin and has no CORS policy. `DASHBOARD_DEV_ORIGIN` is
allowed only in non-production local React development.

Start production:

```bash
yarn docker:prod
```

Check status and logs:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env ps
yarn docker:prod:logs
```

Run the post-deploy smoke test from any machine that can reach the public dashboard URL:

```bash
yarn smoke:dashboard https://castle-grooves.lan
```

It checks the React entry point, the proxied health response, and the unauthenticated API boundary. Then sign in with Discord and verify the live connection indicator, a queue action as a DJ, and a view-only account’s disabled controls.

## Manual Update

Watchtower normally handles updates. To force an immediate pull and restart:

```bash
yarn docker:prod:pull
yarn docker:prod
```

## Watchtower

Watchtower is defined in `docker-compose.prod.yml` and only updates containers with the bot label:

```yaml
labels:
  com.centurylinklabs.watchtower.enable: true
```

Default behavior:

- Poll every 300 seconds.
- Remove old images after updating.
- Include restarting containers.
- Use `TZ` from `.env`, defaulting to `America/Toronto`.

Disable Watchtower temporarily:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env stop watchtower
```

## Data Persistence

- InfluxDB data and config live in Docker volumes.
- Recordings live in `./recordings` on the host.
- Lavalink logs live in `./lavalink/logs` on the host.
- Vosk models are mounted from `./models` and are not committed.

Back up the production InfluxDB volume:

```bash
docker run --rm -v castle-grooves_influxdb-data:/data -v ${PWD}:/backup alpine tar czf /backup/influxdb-backup.tar.gz -C /data .
```

## Troubleshooting

Watchtower not updating:

```bash
yarn docker:prod:logs
docker inspect castle-grooves-bot-1
```

Bot not starting after update:

```bash
yarn docker:prod:logs
```

If needed, pin the image tag in `docker-compose.prod.yml`, run `yarn docker:prod:pull`, then `yarn docker:prod`.

## Quick Reference

```bash
yarn docker:prod
yarn docker:prod:pull
yarn docker:prod:logs
yarn docker:prod:down
```
