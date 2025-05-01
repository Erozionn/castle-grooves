# Use Node Version: 16 LTS

# Set ARG and ENV variable defaults
ARG PORT=1337

FROM node:lts-alpine AS builder
ARG PORT

RUN apk update && apk add --no-cache python3 make g++ fontconfig
RUN corepack enable && corepack prepare yarn@stable --activate && yarn set version 4

WORKDIR /usr/src/app
COPY package.json yarn.lock .yarnrc.yml ./
COPY patches ./patches
RUN yarn install --immutable
COPY . .
RUN yarn build

# Final stage
FROM node:lts-alpine AS final
ARG PORT

# Install ffmpeg and other dependencies from Alpine packages
RUN apk update && \
  apk add --no-cache \
  python3 \
  make \
  g++ \
  fontconfig \
  ffmpeg

RUN corepack enable && corepack prepare yarn@stable --activate && yarn set version 4

ENV NODE_ENV production

WORKDIR /usr/src/app
COPY package.json yarn.lock .yarnrc.yml ./
COPY patches ./patches

RUN yarn install --immutable

COPY --from=builder /usr/src/app/assets ./assets
COPY --from=builder /usr/src/app/build ./build

ENV PORT=${PORT}
EXPOSE ${PORT}

CMD [ "node", "build/index.js" ]