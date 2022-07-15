# Castle Grooves
A modern self-hosted alternative to the late Groovy Bot.
## Features

* Intuitive Slash Commands
* Sleek Song Interface
* Unlimited Song Queue
* Music Player Discord Buttons
* Music History Menu
* InfluxDB support for song history and top played songs
* *And More!*
### Commands


|         Name         |            Description                 |            Options             |
|:---------------------|:--------------------------------------:|-------------------------------:|
|   **/pause**         |       Pause the current song           |                                |
|   **/play**          |      Play a song from youtube          |             \<query>           |
| **/play-next**       | Add a song to the top of the queue     |             \<query>           |
|  **/resume**         |      Resume the current song           |                                |
|  **/shuffle**        |         Shuffle the queue              |                                |
|   **/skip**          |      Skip to the current song          |                                |
| **/top-songs list**  |   Lists top songs for server or user   | \<number> \<time-range> \<user>|
| **/top-songs play**  |   Plays top songs for server or user   | \<number> \<time-range> \<user>|

## Install

### Manually

1. Install FFMPEG and InfluxDB.
2. Clone the repository. `git clone https://github.com/Erozionn/castle-grooves`
3. Install the dependencies. `yarn install` or `npm install`
4. Copy the `.env.example` file as `.env` and fill it.
5. run using `yarn start` or `npm run start`
### Docker

1. Install FFMPEG and InfluxDB.
2. Build the image `docker build . -t erozionn/castle-grooves`
   Your image will now be listed by Docker:
   ```
    $ docker images

    # Example
    REPOSITORY                      TAG        ID              CREATED
    node                            16         3b66eb585643    5 days ago
    erozionn/castle-grooves         latest     d64d3505b0d2    1 minute ago
   ```
3. Run the image `docker run -p 8080:1338 -d erozionn/castle-grooves`
## Environment Variables

* `CLIENT_ID` is the ID of your Discord Bot
* `GUILD_ID` is the ID of your Discord Server
* `BOT_TOKEN` is the token of your Discord BOT
* `ADMIN_USER_ID` is the ID of your Discord Account
* `DEFAULT_TEXT_CHANNEL` is the ID of your Discord Server's Default Text Channel
* `INFLUX_URL` is the URL to you InfluxDB
* `INFLUX_BUCKET` is your InfluxDB bucket name
* `INFLUX_ORG` is your InfluxDB Organization name
* `INFLUX_TOKEN` is your InfluxDB Access Token
* `WEBSERVER_PORT` is the port for the integrated API
* `WEB_URL` is the URL directed to this bot
