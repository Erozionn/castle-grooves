# Use Node Version: 16 LTS

# Set ARG and ENV variable defaults
ARG port=1337

FROM jrottenberg/ffmpeg:4.1-alpine AS ffmpeg

FROM node:lts-alpine AS builder

RUN apk update && apk add --no-cache python3 make g++ fontconfig
RUN corepack enable && corepack prepare yarn@stable --activate && yarn set version 4

WORKDIR /usr/src/app
COPY package.json yarn.lock .yarnrc.yml ./
# COPY patches ./patches
RUN yarn install --immutable
COPY . .
RUN yarn build

# Final

FROM node:lts-alpine AS final

COPY --from=ffmpeg / /

RUN apk update && apk add --no-cache python3 make g++ fontconfig
RUN corepack enable && corepack prepare yarn@stable --activate && yarn set version 4

ENV NODE_ENV production

WORKDIR /usr/src/app
COPY package.json yarn.lock .yarnrc.yml ./
# COPY patches ./patches

RUN yarn install --immutable

COPY --from=builder /usr/src/app/assets ./assets
COPY --from=builder /usr/src/app/build ./build

ENV port=$port
# Expose port $port
EXPOSE $port

CMD [ "node", "build/index.js" ]
