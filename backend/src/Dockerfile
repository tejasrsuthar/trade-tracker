# Build stage: Compiles TypeScript and generates Prisma client
FROM node:18 AS builder
WORKDIR /app

# Install dependencies using package.json
COPY package.json ./
RUN npm install

# Copy source code and generate Prisma client
COPY . .
RUN npx prisma generate
RUN npm run build

# Production stage: Contains only the necessary runtime files
FROM node:18
WORKDIR /app

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma

# Install only production dependencies
RUN npm install --production

# Start the application
CMD ["node", "dist/index.js"]