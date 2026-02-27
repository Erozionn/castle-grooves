# Castle Grooves - Production Deployment Guide

## Automated Deployment with Published Images (Recommended)

Your bot uses **GitHub Actions** to automatically build and publish Docker images. **Watchtower** then automatically updates your production bot when new images are published.

### How It Works

```
1. Push code to GitHub (main branch)
   ↓
2. GitHub Actions builds & publishes image to Docker Hub
   ↓
3. Watchtower detects new image (checks every 5 min)
   ↓
4. Bot automatically updates with zero downtime
```

**You just push code - everything else is automatic!**

### Initial Production Setup

#### 1. Configure GitHub Secrets

Your repository needs these secrets (Settings → Secrets → Actions):

- `DOCKER_HUB_USERNAME` - Your Docker Hub username
- `DOCKER_HUB_ACCESS_TOKEN` - Docker Hub access token ([create here](https://hub.docker.com/settings/security))

#### 2. Deploy on Production Server

```bash
# Clone repository
git clone <your-repo-url>
cd castle-grooves

# Create .env file
cp .env.example .env
nano .env
```

Add to your `.env`:
```bash
DOCKER_HUB_USERNAME=your-dockerhub-username  # Same as GitHub secret
# ... plus all other required env vars
```

#### 3. Start Services

```bash
# Use production compose file (pulls published image)
docker-compose -f docker-compose.prod.yml up -d

# Verify everything is running
docker-compose -f docker-compose.prod.yml ps
```

That's it! Your bot is now:
- ✅ Running from published image
- ✅ Auto-updating when you push code
- ✅ Auto-restarting on crashes

### Deployment Workflow

#### For Developers (Zero Manual Steps)

```bash
# 1. Make changes locally
git add .
git commit -m "Add cool feature"
git push origin main

# 2. That's it! GitHub Actions builds and publishes
# 3. Watchtower updates production automatically (within 5 min)
```

#### Manual Update (If Needed)

```bash
# Force immediate update instead of waiting for Watchtower
docker-compose -f docker-compose.prod.yml pull bot
docker-compose -f docker-compose.prod.yml up -d
```

### Development vs Production

**Development** (`docker-compose.yml`):
- Builds image locally from source code
- Use for local testing: `docker-compose --env-file .env.dev up -d`

**Production** (`docker-compose.prod.yml`):
- Pulls published image from Docker Hub
- Auto-updates via Watchtower
- Use on server: `docker-compose -f docker-compose.prod.yml up -d`

## Auto-Update Setup (Watchtower)

### How It Works

1. **GitHub Actions publishes** new image to Docker Hub when you push to main
2. **Watchtower checks** Docker Hub every 5 minutes for new images
3. When found, Watchtower **automatically restarts** with new image
4. Old image is **cleaned up**

### Configuration

Watchtower is configured in `docker-compose.prod.yml`:

```yaml
watchtower:
  environment:
    - WATCHTOWER_CLEANUP=true           # Auto-remove old images
    - WATCHTOWER_POLL_INTERVAL=300      # Check every 5 minutes
    - WATCHTOWER_LABEL_ENABLE=true      # Only update labeled containers
```

**To change update frequency:**
Edit `WATCHTOWER_POLL_INTERVAL` (in seconds). Default: 300 (5 minutes)

### Monitoring

```bash
# View all logs
docker-compose -f docker-compose.prod.yml logs -f

# View bot logs only
docker-compose -f docker-compose.prod.yml logs -f bot

# View Watchtower logs (see when updates happen)
docker-compose -f docker-compose.prod.yml logs -f watchtower

# Check container status
docker-compose -f docker-compose.prod.yml ps

# Check resource usage
docker stats
```

### Manual Operations

```bash
# Stop all services
docker-compose -f docker-compose.prod.yml down

# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Pull latest image and restart
docker-compose -f docker-compose.prod.yml pull bot
docker-compose -f docker-compose.prod.yml up -d

# View Watchtower activity
docker-compose -f docker-compose.prod.yml logs watchtower
```

### Disable Auto-Updates

If you want to **disable** Watchtower:

```bash
docker-compose -f docker-compose.prod.yml stop watchtower
```

Then update manually when needed:
```bash
docker-compose -f docker-compose.prod.yml pull bot
docker-compose -f docker-compose.prod.yml up -d
```

### Troubleshooting

**Watchtower not updating:**
```bash
# Check Watchtower logs
docker-compose logs watchtower

# Verify bot has the label
docker inspect castle-grooves-bot | grep watchtower

# Manually trigger update
docker-compose restart bot
```

**Bot not starting after update:**
```bash
# Check bot logs for errors
docker-compose logs bot

# Roll back to previous image (if needed)
docker-compose down
docker-compose up -d
```

### Data Persistence

- **InfluxDB data** is stored in a Docker volume - survives container updates
- **Recordings** are in `./recordings` directory - persisted on host
- **Lavalink logs** are in `./lavalink/logs` - persisted on host

**Backup InfluxDB:**
```bash
docker run --rm -v castle-grooves_influxdb-data:/data -v $(pwd):/backup alpine tar czf /backup/influxdb-backup.tar.gz -C /data .
```

---

## Summary

### Production Deployment (Fully Automated)

✅ **Push code to GitHub** → **GitHub Actions builds & publishes** → **Watchtower auto-updates within 5 min**

**No server access needed!** Just push code and it deploys automatically.

### First-Time Setup Checklist

1. ☑️ Add `DOCKER_HUB_USERNAME` and `DOCKER_HUB_ACCESS_TOKEN` to GitHub Secrets
2. ☑️ Create `.env` file on server with `DOCKER_HUB_USERNAME` and all required vars
3. ☑️ Run `docker-compose -f docker-compose.prod.yml up -d`
4. ☑️ Push code to main branch - done!

### Quick Reference

```bash
# Production server commands
cd castle-grooves

# Start services
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Manual update (optional)
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```
