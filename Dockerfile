ARG NODE_VERSION=22.23.4-bookworm-slim
ARG COREPACK_VERSION=0.36.0
ARG PORT=1337

FROM node:${NODE_VERSION} AS base
ARG COREPACK_VERSION
ARG CA_CERTIFICATES_MIN_VERSION=20250419~deb12u2

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
  dpkg --compare-versions "$(dpkg-query -W -f='${Version}' ca-certificates)" ge "${CA_CERTIFICATES_MIN_VERSION}" && \
  update-ca-certificates && \
  rm -rf /var/lib/apt/lists/*

RUN npm install --global corepack@${COREPACK_VERSION} && corepack enable

WORKDIR /usr/src/app
COPY package.json yarn.lock .yarnrc.yml ./
COPY patches ./patches

RUN corepack install && YARN_ENABLE_SCRIPTS=true yarn install --immutable --inline-builds && node -e "require('vosk'); require('@discordjs/opus'); require('@discordjs/voice'); require('@snazzah/davey')"

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
