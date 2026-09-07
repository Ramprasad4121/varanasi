# Author: Ramprasad — production image for varanasi signal service (Hedera x402 + HCS).
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc
EXPOSE 4021
ENV NODE_ENV=production PORT=4021
CMD ["node", "dist/server.js"]
