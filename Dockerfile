ARG NODE_VERSION=lts-slim
ARG YARN_VERSION=4.9.1
ARG PORT=1337

FROM node:${NODE_VERSION} AS base
ARG YARN_VERSION

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

RUN corepack enable && corepack prepare yarn@${YARN_VERSION} --activate

WORKDIR /usr/src/app
COPY package.json yarn.lock .yarnrc.yml ./
COPY patches ./patches

RUN yarn install --immutable && node -e "require('vosk'); require('@discordjs/opus'); require('@discordjs/voice'); require('@snazzah/davey')"

FROM base AS dev
ARG PORT
ENV NODE_ENV=development
COPY . .
EXPOSE ${PORT} 9229
CMD ["yarn", "start:dev"]

FROM base AS builder
COPY . .
RUN yarn build

FROM base AS production
ARG PORT
ENV NODE_ENV=production
COPY --from=builder /usr/src/app/assets ./assets
COPY --from=builder /usr/src/app/build ./build
EXPOSE ${PORT}
CMD ["sh", "-c", "if [ \"$VOICE_HELLO_RESPONSES_ENABLED\" = \"true\" ]; then node build/scripts/downloadHelloSounds.js || echo '[hello-responses] Download failed; replies remain unavailable.'; fi; exec node build/index.js"]
