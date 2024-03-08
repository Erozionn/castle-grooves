declare global {
  namespace NodeJS {
    interface ProcessEnv {
      CLIENT_ID: string
      GUILD_ID: string
      BOT_TOKEN: string
      SPOTIFY_COUNTRY?: string
      SPOTIFY_CLIENT_ID?: string
      SPOTIFY_CLIENT_SECRET?: string
      ADMIN_USER_ID?: string
      DEFAULT_TEXT_CHANNEL?: string
      INFLUX_URL?: string
      INFLUX_BUCKET?: string
      INFLUX_ORG?: string
      INFLUX_TOKEN?: string
      WEBSERVER_PORT?: string
      YOUTUBE_COOKIE?: string
      NOW_PLAYING_MOCK_DATA?: string
    }
  }
}

export {}
