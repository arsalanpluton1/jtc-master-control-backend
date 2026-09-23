# JTC Master Control Backend

Node.js, TypeScript, Express, and MongoDB API for JTC Master Control.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

## Scripts

- `npm run dev`: start the API in watch mode.
- `npm run build`: compile TypeScript to `dist`.
- `npm run create:initial-admin`: create or update the first Admin account from environment variables after a build.
- `npm start`: run the compiled API.

## Environment Variables

- `PORT`: API port. Defaults to `4000`.
- `MONGODB_URI`: MongoDB connection string.
- `CORS_ORIGIN`: allowed dashboard origin.
- `NODE_ENV`: runtime environment.
- `AUTH_TOKEN_SECRET`: HMAC secret for dashboard bearer sessions. Required when `NODE_ENV=production`.
- `AUTH_TOKEN_TTL_SECONDS`: session lifetime. Defaults to 8 hours.

## Initial Admin

Do not hardcode production credentials. Set the bootstrap values in the runtime environment, build once, then run the script:

```bash
npm run build
INITIAL_ADMIN_EMAIL=admin@example.com \
INITIAL_ADMIN_DISPLAY_NAME="JTC Admin" \
INITIAL_ADMIN_PASSWORD="use-a-long-unique-password" \
AUTH_TOKEN_SECRET="use-a-long-random-secret" \
MONGODB_URI="mongodb://..." \
npm run create:initial-admin
```

On Windows PowerShell:

```powershell
$env:INITIAL_ADMIN_EMAIL="admin@example.com"
$env:INITIAL_ADMIN_DISPLAY_NAME="JTC Admin"
$env:INITIAL_ADMIN_PASSWORD="use-a-long-unique-password"
$env:AUTH_TOKEN_SECRET="use-a-long-random-secret"
$env:MONGODB_URI="mongodb://..."
npm run build
npm run create:initial-admin
```

The script upserts an `active` `admin` user and stores only a salted `scrypt` password hash.

## API

- `GET /api/health`: returns API and database status.
- `POST /api/auth/login`: signs in active Admin and Store Manager accounts.
- `GET /api/auth/me`: returns the current authenticated dashboard user.
- `GET /api/admin/overview`: Admin-only Phase 1 overview counts.
- `GET /api/admin/stores`: Admin-only store list.
- `GET /api/admin/stations`: Admin-only station list with assigned store summaries.
- `GET /api/admin/stations/:stationId`: Admin-only station detail.
- `POST /api/admin/stations`: Admin-only station creation.
- `GET /api/manager/stores/:storeId/summary`: protected store summary. Store Managers are denied unless `:storeId` matches their active manager assignment.

## Auth Verification

After seeding an Admin, an active Store Manager `UserAccount`, an active `Store`, and an active manager `StoreEmployee` assignment, verify:

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin-password"}'

curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"manager@example.com","password":"manager-password"}'

curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"inactive@example.com","password":"inactive-password"}'
```

The first two should return `token` and `user`. The inactive account should return `403 Account is not active`.

Use the Store Manager token to confirm store scoping:

```bash
curl http://localhost:4000/api/manager/stores/ASSIGNED_STORE_ID/summary \
  -H "Authorization: Bearer MANAGER_TOKEN"

curl http://localhost:4000/api/manager/stores/OTHER_STORE_ID/summary \
  -H "Authorization: Bearer MANAGER_TOKEN"
```

The assigned store request should succeed. The other store request should return `403 Store managers can only access their assigned store`.
