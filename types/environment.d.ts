declare global {
  namespace NodeJS {
    interface ProcessEnv {
      CLIENT_ID: string
      GUILD_ID: string
      BOT_TOKEN: string
      ADMIN_USER_ID?: string
      DEFAULT_TEXT_CHANNEL?: string
      INFLUX_URL?: string
      INFLUX_BUCKET?: string
      INFLUX_ORG?: string
      INFLUX_TOKEN?: string
      WEBSERVER_PORT?: string
      NOW_PLAYING_MOCK_DATA?: string
      PRELOAD_SONG_DATA?: string
      SPOTIFY_CLIENT_ID?: string
      SPOTIFY_CLIENT_SECRET?: string
      SPOTIFY_MARKET?: string
      LAVALINK_HOST?: string
      LAVALINK_PORT?: string
      LAVALINK_PASSWORD?: string
      TS_NODE_DEV?: string
      DASHBOARD_PUBLIC_URL?: string
      DASHBOARD_DEV_ORIGIN?: string
      DISCORD_OAUTH_CLIENT_ID?: string
      DISCORD_OAUTH_CLIENT_SECRET?: string
      DISCORD_OAUTH_REDIRECT_URI?: string
      DASHBOARD_SESSION_SECRET?: string
      DASHBOARD_ADMIN_DISCORD_USER_IDS?: string
      DASHBOARD_DJ_DISCORD_USER_IDS?: string
      DASHBOARD_VIEWER_DISCORD_USER_IDS?: string
    }
  }
}

export {}
