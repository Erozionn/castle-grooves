# Use Node Version: 16 LTS

# Set ARG and ENV variable defaults
ARG PORT=1337

FROM jrottenberg/ffmpeg:4.1-alpine AS ffmpeg

FROM node:lts-alpine AS builder
ARG PORT

RUN apk update && apk add --no-cache python3 make g++ fontconfig

WORKDIR /usr/src/app

# Copy package files first
COPY package.json yarn.lock .yarnrc.yml ./

# Set up Yarn
RUN corepack enable && corepack prepare yarn@stable --activate

# Copy source files
COPY . .

# Install dependencies
RUN yarn install --immutable

# Build
RUN yarn build

# Final stage
FROM node:lts-alpine AS final
ARG PORT

COPY --from=ffmpeg /usr/local /usr/local

RUN apk update && apk add --no-cache python3 make g++ fontconfig

WORKDIR /usr/src/app

# Copy package files first
COPY package.json yarn.lock .yarnrc.yml ./

# Set up Yarn
RUN corepack enable && corepack prepare yarn@stable --activate

# Copy source files
COPY . .

# Install dependencies
RUN yarn install --immutable

# Copy build artifacts
COPY --from=builder /usr/src/app/assets ./assets
COPY --from=builder /usr/src/app/build ./build

ENV NODE_ENV=production
ENV PORT=${PORT}
EXPOSE ${PORT}

CMD [ "node", "build/index.js" ]
