# JTC Master Control Backend

Node.js, TypeScript, Express, and MongoDB API for JTC Master Control.

## Setup

```bash
npm install
cp .env.example .env
docker compose up -d mongo
npm run dev
```

## Scripts

- `npm run dev`: start the API in watch mode.
- `npm run build`: compile TypeScript to `dist`.
- `npm run seed:demo`: idempotently add labeled Phase 1 demo data; requires `JTC_DEMO_ADMIN_PASSWORD` and `JTC_DEMO_MANAGER_PASSWORD`.
- `npm run smoke:demo`: run the live Admin and Store Manager API workflow against `JTC_SMOKE_BASE_URL` (defaults to `http://localhost:4010/api`).
- `npm run create:initial-admin`: create or update the first Admin account from environment variables after a build.
- `npm start`: run the compiled API.

## Local MongoDB

For local development, start Docker Desktop and run:

```bash
docker compose up -d mongo
```

The default `.env.example` points to this local database at `mongodb://127.0.0.1:27017/jtc-master-control`.

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

## Demo data and smoke test

For local verification, use a separate development database and temporary demo credentials:

```powershell
$env:JTC_DEMO_ADMIN_PASSWORD="choose-a-demo-admin-password"
$env:JTC_DEMO_MANAGER_PASSWORD="choose-a-demo-manager-password"
npm run seed:demo

$env:PORT="4010"
npm run dev
```

In another PowerShell window:

```powershell
$env:JTC_DEMO_ADMIN_PASSWORD="choose-a-demo-admin-password"
$env:JTC_DEMO_MANAGER_PASSWORD="choose-a-demo-manager-password"
$env:JTC_SMOKE_BASE_URL="http://localhost:4010/api"
npm run smoke:demo
```

The seed uses only `DEMO-` stores, inventory, recipes, products, employees, and requests, and does not delete existing records.

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
- `GET /api/admin/recipes`: Admin-only recipe list with inventory ingredient and costing summaries.
- `GET /api/admin/recipes/:recipeId`: Admin-only recipe detail with ingredient cost and cost-per-yield summaries.
- `POST /api/admin/recipes`: Admin-only recipe creation with inventory reference validation.
- `PUT /api/admin/recipes/:recipeId`: Admin-only recipe update with inventory reference validation.
- `GET /api/admin/products`: Admin-only product list with recipe ingredient-cost and product-cost summaries.
- `GET /api/admin/products/:productId`: Admin-only product detail with selling price, labor cost, other cost, and calculated product cost.
- `GET /api/admin/products/:productId/cost`: Admin-only pricing and P&L cost contract with product cost and gross-margin summaries.
- `POST /api/admin/products`: Admin-only product creation with catalog and cost-input validation.
- `PUT /api/admin/products/:productId`: Admin-only product update with catalog and cost-input validation.
- `GET /api/admin/inventory`: Admin-only inventory list with store stock summaries.
- `GET /api/admin/inventory/:inventoryItemId`: Admin-only inventory item detail with store stock summaries.
- `POST /api/admin/inventory`: Admin-only inventory item creation with an associated store and initial stock quantity.
- `PATCH /api/admin/inventory/:inventoryItemId`: Admin-only inventory source-data update; affected recipe and product costs are recalculated from the latest values.
- `PATCH /api/admin/inventory/:inventoryItemId/packaging`: Admin-only multilevel packaging conversion updates.
- `PATCH /api/admin/inventory/:inventoryItemId/stores/:storeId/stock`: Admin-only store-level stock quantity and threshold updates.
- `GET /api/admin/inventory-requests`: Admin-only inventory request review list.
- `GET /api/admin/inventory-requests/:inventoryRequestId`: Admin-only inventory request detail.
- `PATCH /api/admin/inventory-requests/:inventoryRequestId/decision`: Admin-only approve/reject decision for submitted requests.
- `PATCH /api/admin/inventory-requests/:inventoryRequestId/fulfillment`: Admin-only partial or full fulfillment with store-stock deduction.
- `GET /api/admin/warehouse/overview`: Admin-only Central Warehouse dashboard totals and recent movement.
- `GET /api/admin/warehouse/stock`: Admin-only warehouse stock with product, supplier, cost, and stock-status data.
- `GET /api/admin/warehouse/store-stock`: Admin-only store inventory, optionally filtered by `storeId`.
- `GET /api/admin/warehouse/ledger`: Admin-only inventory movement ledger with transaction and store filters.
- `POST /api/admin/warehouse/receipts`: Admin-only supplier receiving into Central Warehouse.
- `POST /api/admin/warehouse/transfers`: Admin-only warehouse-to-store transfer creation.
- `PATCH /api/admin/warehouse/transfers/:transferId/decision`: Admin-only transfer approval or rejection.
- `PATCH /api/admin/warehouse/transfers/:transferId/dispatch`: Admin-only approved transfer dispatch and warehouse deduction.
- `GET /api/admin/warehouse/returns`: Admin-only store return review list.
- `PATCH /api/admin/warehouse/returns/:returnId/receive`: Admin-only store return receiving into the warehouse.
- `POST /api/admin/warehouse/adjustments`: Admin-only reasoned stock adjustments for warehouse or store stock.
- `POST /api/admin/warehouse/stock-counts`: Admin-only physical stock count reconciliation.
- `GET /api/admin/stations`: Admin-only station list with assigned store summaries.
- `GET /api/admin/stations/:stationId`: Admin-only station detail.
- `POST /api/admin/stations`: Admin-only station creation.
- `GET /api/manager/stores/:storeId/summary`: protected store summary. Store Managers are denied unless `:storeId` matches their active manager assignment.
- `GET /api/manager/stores/:storeId/inventory`: protected store inventory available for replenishment requests.
- `GET /api/manager/stores/:storeId/stations`: protected station options for inventory requests.
- `GET /api/manager/stores/:storeId/inventory-requests`: protected request history for the store.
- `POST /api/manager/stores/:storeId/inventory-requests`: protected Store Manager inventory request creation.
- `GET /api/manager/stores/:storeId/inventory-transfers`: protected warehouse deliveries for the assigned store.
- `PATCH /api/manager/stores/:storeId/inventory-transfers/:transferId/receive`: protected store receiving with discrepancy reason support.
- `GET /api/manager/stores/:storeId/warehouse-returns`: protected return history for the assigned store.
- `POST /api/manager/stores/:storeId/warehouse-returns`: protected store-to-warehouse return request creation.

## Warehouse and inventory flow

The Central Warehouse flow keeps stock balances separate from the existing recipe/product costing flow. Receipts, transfers, store receiving, returns, adjustments, and stock counts all create immutable `InventoryTransaction` ledger records. Warehouse quantities are held in `WarehouseStock`; store quantities remain in `StoreStock`.

Sales and operational consumption are reserved for the future POS/operations integration. The ledger transaction types are already defined so those integrations can append movements without replacing balances directly.

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
