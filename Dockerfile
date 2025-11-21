# Dockerfile for todo-app (Node + SQLite)
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install deps first (package.json expected at repo root)
COPY package*.json ./
RUN npm install --production

# Copy app sources
COPY . ./

# Ensure data dir exists and is owned by node user
RUN mkdir -p /usr/src/app/data && chown -R node:node /usr/src/app/data

# Run as non-root user
USER node

EXPOSE 3000
VOLUME ["/usr/src/app/data"]

CMD ["node", "server-clean.js"]
