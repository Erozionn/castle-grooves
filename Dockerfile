# Set ARG and ENV variable defaults
ARG PORT=1337

FROM node:lts-slim AS builder
ARG PORT

RUN apt-get update && \
  apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  pkg-config \
  libffi-dev \
  fontconfig \
  ffmpeg \
  ca-certificates && \
  rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare yarn@stable --activate && yarn set version 4

WORKDIR /usr/src/app
COPY package.json yarn.lock .yarnrc.yml ./
COPY patches ./patches
RUN yarn install --immutable && node -e "require('vosk'); require('@discordjs/opus'); require('@discordjs/voice'); require('@snazzah/davey')"
COPY . .
RUN yarn build

# Final stage
FROM node:lts-slim AS final
ARG PORT

RUN apt-get update && \
  apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  pkg-config \
  libffi-dev \
  fontconfig \
  ffmpeg \
  ca-certificates && \
  rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare yarn@stable --activate && yarn set version 4

ENV NODE_ENV production

WORKDIR /usr/src/app
COPY package.json yarn.lock .yarnrc.yml ./
COPY patches ./patches

RUN yarn install --immutable && node -e "require('vosk'); require('@discordjs/opus'); require('@discordjs/voice'); require('@snazzah/davey')"

COPY --from=builder /usr/src/app/assets ./assets
COPY --from=builder /usr/src/app/build ./build

ENV PORT=${PORT}
EXPOSE ${PORT}

CMD [ "node", "build/index.js" ]
