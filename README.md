# WorkTrack Pro - Enterprise Backend API

High-performance Remote Employee Monitoring & Time Tracking Backend API built with Fastify, TypeScript, Prisma, and Argon2/JWT authentication.

## 🚀 Key Features
- **High-Throughput Ingestion**: Batched agent telemetry (`/api/v1/agent/events/batch`) with Win32 clock drift correction.
- **Dynamic Org Policy**: Remote management of idle thresholds, process privacy filters, and window tracking.
- **Auto-Update Engine**: Native agent versioning and automatic background updates.
- **Enterprise RBAC**: Super Admin, IT Admin, Manager, and Employee tiers.

## 📦 Setup & Run

```bash
# 1. Install dependencies & build shared contracts
npm install
npm run build:contracts

# 2. Initialize database
npx prisma db push --schema prisma/schema.sqlite.prisma
npx tsx prisma/seed.sqlite.ts

# 3. Start development server
npm run dev:api
```

Default Credentials:
- **Admin**: `admin@enterprise.local` / `Admin@123456`
- **Manager**: `manager@enterprise.local` / `Manager@123456`
- **Employee**: `ali.khan@enterprise.local` / `Employee@123456`
