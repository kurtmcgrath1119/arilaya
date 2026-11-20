# 1. build the React front end
FROM node:22-bookworm-slim AS client
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# 2. install server packages (build tools are included in case better-sqlite3 needs them)
FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# 3. final image
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/arilaya.db
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json server.js db.js seed.js ./
COPY public ./public
COPY --from=client /client/dist ./client/dist
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 3000
CMD ["sh", "-c", "node seed.js && node server.js"]