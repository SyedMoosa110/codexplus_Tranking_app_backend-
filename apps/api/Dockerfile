FROM node:20-alpine AS builder

WORKDIR /app

# Copy package descriptors
COPY package*.json ./
COPY packages/contracts/package*.json ./packages/contracts/
COPY apps/api/package*.json ./apps/api/
COPY prisma ./prisma

RUN npm install

# Copy source
COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api

# Build contracts & API
RUN npm run build:contracts
RUN npx prisma generate --schema=./prisma/schema.prisma
RUN npm run --workspace=apps/api build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/contracts ./packages/contracts
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package*.json ./apps/api/
COPY --from=builder /app/prisma ./prisma

EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
