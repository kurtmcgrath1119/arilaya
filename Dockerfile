# 1. build the React front end
FROM node:22-bookworm-slim AS client
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# 2. install server packages
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# 3. final image
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000 \
    GOOGLE_CLIENT_ID=370041677958-7utg9bm6s09ot545rneb3gc7rp67accp.apps.googleusercontent.com
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json server.js db.js ./
COPY public ./public
COPY --from=client /client/dist ./client/dist
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "server.js"]
