# Use Node Version: 16 LTS

# Set ARG and ENV variable defaults
ARG PORT=1337

FROM jrottenberg/ffmpeg:4.1-alpine AS ffmpeg

FROM node:lts-alpine AS builder
ARG PORT

RUN apk update && apk add --no-cache python3 make g++ fontconfig
RUN corepack enable && corepack prepare yarn@stable --activate && yarn set version 4

WORKDIR /usr/src/app
COPY . .
RUN yarn install --immutable
RUN yarn build

# Final

FROM node:lts-alpine AS final
ARG PORT

COPY --from=ffmpeg /usr/local /usr/local

RUN apk update && apk add --no-cache python3 make g++ fontconfig
RUN corepack enable && corepack prepare yarn@stable --activate && yarn set version 4

ENV NODE_ENV=production

WORKDIR /usr/src/app
COPY . .
RUN yarn install --immutable

COPY --from=builder /usr/src/app/assets ./assets
COPY --from=builder /usr/src/app/build ./build

ENV PORT=${PORT}
EXPOSE ${PORT}

CMD [ "node", "build/index.js" ]
