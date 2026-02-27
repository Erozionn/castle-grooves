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
    }
  }
}

export {}
