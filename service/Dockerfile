# Author: Ramprasad — production image for the varanasi signal service.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Receipt log + HCS cache live here; mount a volume in production.
RUN mkdir -p /app/data
EXPOSE 4021
CMD ["node", "dist/server.js"]
