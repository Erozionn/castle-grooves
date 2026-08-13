# Castle Grooves Production Deployment Guide

Production deployment uses GitHub Actions to build and publish Docker images to Docker Hub. The production Compose stack runs Watchtower so the bot container updates automatically when a new image is published.

## How It Works

1. Push to `main`.
2. GitHub Actions builds `Dockerfile` target `production` and publishes `${DOCKER_HUB_USERNAME}/castle-grooves:latest`.
3. Watchtower checks Docker Hub every 5 minutes.
4. Watchtower replaces the bot container when a newer image is available.

## GitHub Setup

Add these repository secrets under Settings > Secrets and variables > Actions:

- `DOCKER_HUB_USERNAME`
- `DOCKER_HUB_ACCESS_TOKEN`

The workflow in `.github/workflows/docker-image.yml` publishes:

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

Start production:

```bash
yarn docker:prod
```

Check status and logs:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env ps
yarn docker:prod:logs
```

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
