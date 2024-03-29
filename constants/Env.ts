const {
  CLIENT_ID,
  GUILD_ID,
  BOT_TOKEN,
  ADMIN_USER_ID,
  DEFAULT_TEXT_CHANNEL,
  INFLUX_URL,
  INFLUX_BUCKET,
  INFLUX_ORG,
  INFLUX_TOKEN,
  WEBSERVER_PORT,
  YOUTUBE_COOKIE,
  YOUTUBE_IDENTITY_TOKEN,
  NOW_PLAYING_MOCK_DATA,
  SPOTIFY_COUNTRY,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
} = process.env

const ENV = {
  CLIENT_ID,
  GUILD_ID,
  BOT_TOKEN,
  ADMIN_USER_ID,
  DEFAULT_TEXT_CHANNEL,
  INFLUX_URL,
  INFLUX_BUCKET,
  INFLUX_ORG,
  INFLUX_TOKEN,
  WEBSERVER_PORT: WEBSERVER_PORT || '8080',
  YOUTUBE_COOKIE: YOUTUBE_COOKIE || '',
  YOUTUBE_IDENTITY_TOKEN,
  NOW_PLAYING_MOCK_DATA: NOW_PLAYING_MOCK_DATA || false,
  SPOTIFY: {
    COUNTRY: SPOTIFY_COUNTRY || 'CA',
    CLIENT_ID: SPOTIFY_CLIENT_ID,
    CLIENT_SECRET: SPOTIFY_CLIENT_SECRET,
  },
}

export default ENV
