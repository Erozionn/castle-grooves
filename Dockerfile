# Use Node Version: 16 LTS
FROM node:16

# Set ARG and ENV variable defaults
ARG port=1337
ENV port=$port

# Create a directory for the app
WORKDIR /usr/src/castle-grooves

# Install app dependencies
COPY package*.json ./
COPY patches ./patches
RUN npm ci --only=production

# Bundle app source
COPY . .

# Expose port $port
EXPOSE $port

CMD [ "node", "index.js" ]
