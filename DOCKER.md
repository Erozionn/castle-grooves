# Castle Grooves Docker Compose Setup

This project uses Docker Compose to orchestrate all services needed for the Castle Grooves Discord bot.

## Services

- **bot**: Discord bot application (Node.js)
- **lavalink**: Audio server for music playback
- **influxdb**: Time-series database for song history

## Quick Start

1. **Copy environment variables:**

   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` file** with your credentials:

   - Discord bot token and client credentials
   - Spotify API credentials
   - InfluxDB configuration (use the defaults or customize)
   - Lavalink password

3. **Ensure Lavalink configuration exists:**
   Make sure `lavalink/application.yml` is present with your Lavalink configuration.

4. **Start all services:**

   ```bash
   docker-compose up -d
   ```

5. **View logs:**

   ```bash
   # All services
   docker-compose logs -f

   # Specific service
   docker-compose logs -f bot
   docker-compose logs -f lavalink
   docker-compose logs -f influxdb
   ```

6. **Stop all services:**

   ```bash
   docker-compose down
   ```

7. **Stop and remove volumes (clean slate):**
   ```bash
   docker-compose down -v
   ```

## Service URLs

- **Bot API**: http://localhost:1337
- **Lavalink**: http://localhost:2333
- **InfluxDB UI**: http://localhost:8086

## Building

To rebuild the bot after code changes:

```bash
docker-compose build bot
docker-compose up -d bot
```

## Environment Variables

See `.env.example` for all required environment variables.

### Critical Variables:

- `DISCORD_TOKEN`: Your Discord bot token
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`: Spotify API credentials
- `INFLUX_TOKEN`: InfluxDB authentication token (auto-generated on first run)
- `LAVALINK_PASSWORD`: Password for Lavalink connection

## Volumes

- `influxdb-data`: Persistent storage for InfluxDB data
- `influxdb-config`: InfluxDB configuration files
- `./recordings`: Bot voice recordings (if enabled)

## Networks

All services communicate over the `castle-grooves` bridge network.

## Health Checks

- **InfluxDB**: Automatic health check ensures it's ready before bot starts
- **Lavalink**: Bot waits for Lavalink to be started

## Troubleshooting

### Bot can't connect to Lavalink

- Check `SHOUKAKU_HOST=lavalink` in bot environment (matches service name)
- Verify `LAVALINK_PASSWORD` matches in both bot and Lavalink services

### InfluxDB initialization fails

- First run sets up admin user with `INFLUX_ADMIN_USERNAME` and `INFLUX_ADMIN_PASSWORD`
- Generate a secure `INFLUX_TOKEN` or let InfluxDB generate one

### Bot crashes on startup

- Check logs: `docker-compose logs bot`
- Ensure all environment variables are set correctly
- Verify InfluxDB is healthy: `docker-compose ps`
