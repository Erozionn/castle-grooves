# Use Node Version: 16 LTS

# Set ARG and ENV variable defaults
ARG port=1337

FROM node:18.17.0 AS builder
WORKDIR /app
COPY . .
ENV port=$port
RUN yarn install
RUN yarn build

FROM node:18.17.0 AS final
WORKDIR /app
COPY --from=builder ./app/build ./build
COPY package.json .
COPY yarn.lock .
RUN yarn install --production

ENV port=$port
ENV NODE_ENV production 

# Expose port $port
EXPOSE $port

CMD [ "yarn", "start:prod" ]
