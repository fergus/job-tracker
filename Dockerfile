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
RUN mkdir -p /app/data /app/uploads && chown -R nodejs:nodejs /app/data /app/uploads
USER nodejs
EXPOSE 3000
CMD ["node", "server/index.js"]
