# Castle Grooves Docker Compose Setup

This project uses Docker Compose v2 to run the bot, Lavalink, InfluxDB, and Grafana. Compose is split into a shared base file plus environment-specific overrides:

- `docker-compose.yml`: shared service configuration, network, volumes, health checks, and environment mapping.
- `docker-compose.dev.yml`: local development build target, hot reload mounts, debugger port, and dev volume names.
- `docker-compose.prod.yml`: published Docker Hub image plus Watchtower auto-updates.

## Local Development

1. Copy the example environment:

```bash
cp .env.example .env.dev
```

2. Fill `.env.dev` with your Discord, Spotify, Lavalink, InfluxDB, and Grafana values. Set `BOT_PUBLIC_URL` to the LAN-accessible bot API URL and `GRAFANA_PUBLIC_URL` to the exact LAN URL used to open Grafana.

3. Start the stack with hot reload:

```bash
yarn docker:dev
```

Useful commands:

```bash
yarn docker:dev:detached
yarn docker:dev:logs
yarn docker:dev:down
```

The dev stack uses the `dev` target in the main `Dockerfile`, mounts the repo into `/usr/src/app`, and keeps container `node_modules` in a named volume so the host checkout is not overwritten.

## Production

Production pulls the published image from Docker Hub and starts Watchtower for automatic bot updates:

```bash
cp .env.example .env
# edit .env, including DOCKER_HUB_USERNAME
yarn docker:prod
```

Useful commands:

```bash
yarn docker:prod:pull
yarn docker:prod:logs
yarn docker:prod:down
```

## Direct Compose Commands

The package scripts wrap these commands:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.dev up --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env up -d
```

## Service URLs

- Bot API: `http://localhost:${WEBSERVER_PORT}`
- Lavalink: `http://localhost:2333`
- InfluxDB UI: `http://localhost:8086`
- Grafana: `http://<host>:${GRAFANA_PORT:-3000}`
- Dozzle logs (production only): `http://<host>:8080`

Dozzle reads Docker logs through a read-only Docker socket mount. Its UI is intentionally unauthenticated, so restrict access to port `8080` with your host firewall or network controls.

Grafana listens on all host interfaces so trusted LAN devices can reach it. On first visit, sign in with Grafana's default `admin` / `admin` credentials and set a new password when prompted. Anonymous access and self-service sign-up are disabled. Restrict the Grafana port with your host firewall to trusted devices only.

`BOT_PUBLIC_URL` must point at the bot API from a browser on that LAN, for example `http://192.168.1.100:1337`. `GRAFANA_PUBLIC_URL` must be the exact Grafana browser origin, for example `http://192.168.1.100:3000`; it is the only browser origin granted CORS access to DJ Console controls. Dashboard Play Song links queue music for `ADMIN_USER_ID`; that Discord user must already be in a voice channel. The bot API is network-protected only, so do not expose it to untrusted networks.

The DJ Console needs a bot image built from this revision: it writes the `playback_snapshot`, `bot_runtime`, `bot_state`, and `lavalink_state` measurements. Deploy the updated bot image before expecting live playback and health data; Listening Recap uses existing history immediately.

## Logging

The bot emits timestamped, human-readable logs to container stdout. Set `LOG_LEVEL=debug` temporarily to include queue, cache, and Lavalink diagnostics; the production default is `info`. `PERF_LOGGING=true` adds opt-in timing events.

Docker retains at most three 10 MB `json-file` log files per service. Dozzle viewers can see logged track titles, requester IDs, and guild IDs, so limit access to the UI accordingly.

## Building Images

Build the production image locally:

```bash
yarn docker:build
```

Build specific Dockerfile targets manually:

```bash
docker build --target dev -t castle-grooves:dev-test .
docker build --target production -t castle-grooves:prod-test .
```

## Volumes

- `influxdb-data` / `influxdb-config`: persistent production InfluxDB data and config.
- `grafana-data`: Grafana users, preferences, and local state.
- `influxdb-data-dev` / `influxdb-config-dev`: isolated local development InfluxDB data and config.
- `node_modules` / `yarn_cache`: dev-only container dependency volumes.
- `./recordings`: persisted bot voice recordings.
- `./models`: read-only Vosk model mount.
- `./lavalink/logs`: Lavalink logs.

## Troubleshooting

### Bot cannot connect to Lavalink

- Check `LAVALINK_HOST=lavalink` and `LAVALINK_PASSWORD` in your env file.
- In production, Lavalink must pass its healthcheck before the bot starts.

### InfluxDB initialization fails

- First run initializes the admin user and bucket from `INFLUX_ADMIN_USERNAME`, `INFLUX_ADMIN_PASSWORD`, `INFLUX_ORG`, `INFLUX_BUCKET`, and `INFLUX_TOKEN`.
- If you change initialization values after the first run, remove the matching InfluxDB volumes and start again.

### Bot crashes on startup

```bash
yarn docker:dev:logs
# or
yarn docker:prod:logs
```

Check that required env vars are set and the Vosk model path exists if voice commands are enabled.
