# Build stage
FROM node:20-alpine AS build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Runtime stage
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev
COPY server/ ./server/
COPY --from=build /app/client/dist ./client/dist
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
RUN apk add --no-cache su-exec
RUN mkdir -p /app/data /app/uploads && chown -R nodejs:nodejs /app/data /app/uploads
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
