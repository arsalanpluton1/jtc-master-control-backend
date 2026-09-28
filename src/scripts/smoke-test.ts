import "dotenv/config";

const baseUrl = (process.env.JTC_SMOKE_BASE_URL ?? "http://localhost:4010/api").replace(/\/$/, "");
const adminEmail = "demo.admin@jtc.local";
const managerEmail = "demo.manager@jtc.local";
const adminPassword = process.env.JTC_DEMO_ADMIN_PASSWORD;
const managerPassword = process.env.JTC_DEMO_MANAGER_PASSWORD;

if (!adminPassword || !managerPassword) {
  throw new Error("Set JTC_DEMO_ADMIN_PASSWORD and JTC_DEMO_MANAGER_PASSWORD before running the demo smoke test.");
}

type ApiResponse<T> = {
  status: number;
  body: T;
};

type AuthResponse = {
  token: string;
  user: {
    id: string;
    role: "admin" | "manager";
    storeId?: string;
    storeEmployeeId?: string;
  };
};

async function api<T>(path: string, options: { method?: string; token?: string; body?: unknown } = {}): Promise<ApiResponse<T>> {
  const headers = new Headers();
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (options.token) {
    headers.set("authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = await response.json().catch(() => null) as T;
  return { status: response.status, body };
}

function expectStatus<T>(label: string, response: ApiResponse<T>, expected: number) {
  if (response.status !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${response.status}: ${JSON.stringify(response.body)}`);
  }
  console.log(`ok ${label} (${response.status})`);
  return response.body;
}

function expectValue(label: string, condition: unknown) {
  if (!condition) {
    throw new Error(`${label}: assertion failed`);
  }
  console.log(`ok ${label}`);
}

async function runSmokeTest() {
  expectStatus("health", await api("/health"), 200);

  const adminSession = expectStatus(
    "Admin login",
    await api<AuthResponse>("/auth/login", { method: "POST", body: { email: adminEmail, password: adminPassword } }),
    200,
  );
  const managerSession = expectStatus(
    "Store Manager login",
    await api<AuthResponse>("/auth/login", { method: "POST", body: { email: managerEmail, password: managerPassword } }),
    200,
  );
  expectValue("Admin role returned", adminSession.user.role === "admin");
  expectValue("Manager role and store assignment returned", managerSession.user.role === "manager" && Boolean(managerSession.user.storeId));

  expectStatus("Admin session restore", await api("/auth/me", { token: adminSession.token }), 200);
  expectStatus("Manager session restore", await api("/auth/me", { token: managerSession.token }), 200);
  expectStatus("Manager denied Admin overview", await api("/admin/overview", { token: managerSession.token }), 403);

  const stores = expectStatus<{ stores: Array<{ _id: string; storeNumber: string }> }>("Admin store list", await api("/admin/stores", { token: adminSession.token }), 200);
  const primaryStore = stores.stores.find((store) => store.storeNumber === "DEMO-001");
  const secondaryStore = stores.stores.find((store) => store.storeNumber === "DEMO-002");
  expectValue("Both demo stores visible", Boolean(primaryStore && secondaryStore));
  const storeId = managerSession.user.storeId!;
  expectValue("Manager assigned to primary demo store", storeId === primaryStore!._id);

  expectStatus("Admin overview", await api("/admin/overview", { token: adminSession.token }), 200);
  expectStatus("Admin store detail", await api(`/admin/stores/${storeId}`, { token: adminSession.token }), 200);
  expectStatus("Admin employee list", await api(`/admin/stores/${storeId}/employees`, { token: adminSession.token }), 200);
  expectStatus("Admin station list", await api("/admin/stations", { token: adminSession.token }), 200);
  expectStatus("Admin inventory list", await api("/admin/inventory", { token: adminSession.token }), 200);
  const recipes = expectStatus<{ recipes: Array<{ _id: string; code: string; yieldQuantity: number; yieldUnit: string; ingredients: Array<{ inventoryItemId: string; quantity: number; unit: string; preparationNote?: string | null }> }> }>("Admin recipe list with costs", await api("/admin/recipes", { token: adminSession.token }), 200);
  const demoRecipe = recipes.recipes.find((recipe) => recipe.code === "DEMO-LATTE");
  expectValue("Demo recipe cost is calculated", Boolean(demoRecipe && demoRecipe.ingredients.length === 2));
  const products = expectStatus<{ products: Array<{ _id: string; sku: string; recipeId?: string | null; productCostCents: number | null }> }>("Admin product list with costs", await api("/admin/products", { token: adminSession.token }), 200);
  const demoProduct = products.products.find((product) => product.sku === "DEMO-LATTE");
  expectValue("Demo product cost is exposed", Boolean(demoProduct && demoProduct.productCostCents !== null));
  expectStatus("Product detail", await api(`/admin/products/${demoProduct!._id}`, { token: adminSession.token }), 200);
  expectStatus("Product pricing and P&L cost contract", await api(`/admin/products/${demoProduct!._id}/cost`, { token: adminSession.token }), 200);

  const inventory = expectStatus<{ inventory: Array<{ _id: string; sku: string; purchaseUnit?: string; baseUnit: string; purchasePriceCents?: number | null; packagingLevels?: Array<{ parentUnit: string; childUnit: string; quantity: number }>; stores: Array<{ _id: string; store: { _id: string } | null; quantityOnHand: number; reorderPoint: number; parLevel: number; status: string }> }> }>("Admin inventory list with cost summaries", await api("/admin/inventory", { token: adminSession.token }), 200);
  const demoMilk = inventory.inventory.find((item) => item.sku === "DEMO-MILK")!;
  expectStatus("Inventory source update", await api(`/admin/inventory/${demoMilk._id}`, {
    method: "PATCH",
    token: adminSession.token,
    body: {
      name: demoMilk.sku === "DEMO-MILK" ? "Demo Whole Milk" : demoMilk.sku,
      sku: demoMilk.sku,
      category: "Dairy",
      purchaseUnit: demoMilk.purchaseUnit,
      baseUnit: demoMilk.baseUnit,
      packagingLevels: demoMilk.packagingLevels,
      purchasePriceCents: demoMilk.purchasePriceCents,
      status: "active",
    },
  }), 200);
  const demoStock = demoMilk.stores.find((stock) => stock.store?._id === storeId)!;
  expectStatus("Admin stock update", await api(`/admin/inventory/${demoMilk._id}/stores/${storeId}/stock`, {
    method: "PATCH",
    token: adminSession.token,
    body: {
      quantityOnHand: demoStock.quantityOnHand,
      reorderPoint: demoStock.reorderPoint,
      parLevel: demoStock.parLevel,
      status: demoStock.status,
    },
  }), 200);

  expectStatus("Manager store summary", await api(`/manager/stores/${storeId}/summary`, { token: managerSession.token }), 200);
  expectStatus("Manager store inventory", await api(`/manager/stores/${storeId}/inventory`, { token: managerSession.token }), 200);
  const managerStations = expectStatus<{ stations: Array<{ _id: string; code: string }> }>("Manager station options", await api(`/manager/stores/${storeId}/stations`, { token: managerSession.token }), 200);
  expectStatus("Manager request history", await api(`/manager/stores/${storeId}/inventory-requests`, { token: managerSession.token }), 200);
  expectStatus("Manager employee list", await api(`/manager/stores/${storeId}/employees`, { token: managerSession.token }), 200);
  expectStatus("Manager denied access to another store", await api(`/manager/stores/${secondaryStore!._id}/summary`, { token: managerSession.token }), 403);

  const stationId = managerStations.stations.find((station) => station.code === "DEMO-PREP")?._id;
  const requestBody = expectStatus<{ request: { _id: string; status: string; lines: Array<{ _id: string; inventoryItemId: string; requestedQuantity: number }> } }>("Manager create inventory request", await api(`/manager/stores/${storeId}/inventory-requests`, {
    method: "POST",
    token: managerSession.token,
    body: {
      stationId,
      notes: "Smoke test request",
      items: [{ inventoryItemId: demoMilk._id, requestedQuantity: 2 }],
    },
  }), 201);
  const requestId = requestBody.request._id;
  const lineId = requestBody.request.lines[0]!._id;

  expectStatus("Admin request detail", await api(`/admin/inventory-requests/${requestId}`, { token: adminSession.token }), 200);
  const approved = expectStatus<{ request: { status: string } }>("Admin approve request", await api(`/admin/inventory-requests/${requestId}/decision`, {
    method: "PATCH",
    token: adminSession.token,
    body: { decision: "approve", notes: "Approved by smoke test" },
  }), 200);
  expectValue("Request approved", approved.request.status === "approved");
  const partiallyFulfilled = expectStatus<{ request: { status: string } }>("Admin partial fulfillment", await api(`/admin/inventory-requests/${requestId}/fulfillment`, {
    method: "PATCH",
    token: adminSession.token,
    body: { lines: [{ lineId, quantity: 1 }] },
  }), 200);
  expectValue("Request partially fulfilled", partiallyFulfilled.request.status === "partially_fulfilled");
  const fulfilled = expectStatus<{ request: { status: string } }>("Admin final fulfillment", await api(`/admin/inventory-requests/${requestId}/fulfillment`, {
    method: "PATCH",
    token: adminSession.token,
    body: { lines: [{ lineId, quantity: 1 }] },
  }), 200);
  expectValue("Request fulfilled", fulfilled.request.status === "fulfilled");
  expectStatus("Manager sees fulfilled request history", await api(`/manager/stores/${storeId}/inventory-requests`, { token: managerSession.token }), 200);

  const warehouseReceipt = expectStatus<{ receipt: { transactionNumber: string; warehouseQuantity: number } }>("Admin warehouse receipt", await api("/admin/warehouse/receipts", {
    method: "POST",
    token: adminSession.token,
    body: { inventoryItemId: demoMilk._id, quantity: 20, unit: demoMilk.purchaseUnit, supplier: "Smoke Supplier", invoiceNumber: "SMOKE-INV-001", notes: "Warehouse smoke receipt" },
  }), 201);
  expectValue("Warehouse receipt increased stock", warehouseReceipt.receipt.warehouseQuantity > 0);
  expectStatus("Warehouse overview", await api("/admin/warehouse/overview", { token: adminSession.token }), 200);
  const warehouseStock = expectStatus<{ stock: Array<{ inventoryItemId: string; quantityOnHand: number }> }>("Warehouse stock", await api("/admin/warehouse/stock", { token: adminSession.token }), 200);
  const centralMilk = warehouseStock.stock.find((row) => row.inventoryItemId === demoMilk._id)!;
  expectValue("Central warehouse stock exists", Boolean(centralMilk && centralMilk.quantityOnHand > 0));
  expectStatus("Manager denied warehouse Admin area", await api("/admin/warehouse/overview", { token: managerSession.token }), 403);

  const transfer = expectStatus<{ transfer: { _id: string; transferNumber: string; lines: Array<{ _id: string }> } }>("Admin create warehouse transfer", await api("/admin/warehouse/transfers", {
    method: "POST",
    token: adminSession.token,
    body: { destinationStoreId: storeId, notes: "Warehouse smoke transfer", lines: [{ inventoryItemId: demoMilk._id, quantity: 2, unit: demoMilk.purchaseUnit }] },
  }), 201);
  expectStatus("Admin approve warehouse transfer", await api(`/admin/warehouse/transfers/${transfer.transfer._id}/decision`, { method: "PATCH", token: adminSession.token, body: { decision: "approve" } }), 200);
  expectStatus("Admin dispatch warehouse transfer", await api(`/admin/warehouse/transfers/${transfer.transfer._id}/dispatch`, { method: "PATCH", token: adminSession.token, body: {} }), 200);
  const managerTransfers = expectStatus<{ transfers: Array<{ _id: string; lines: Array<{ _id: string; quantity: number; receivedQuantity: number }> }> }>("Manager warehouse deliveries", await api(`/manager/stores/${storeId}/inventory-transfers`, { token: managerSession.token }), 200);
  const dispatchedTransfer = managerTransfers.transfers.find((candidate) => candidate._id === transfer.transfer._id)!;
  expectValue("Dispatched transfer visible to manager", Boolean(dispatchedTransfer));
  expectStatus("Manager receive warehouse transfer", await api(`/manager/stores/${storeId}/inventory-transfers/${transfer.transfer._id}/receive`, { method: "PATCH", token: managerSession.token, body: { lines: dispatchedTransfer.lines.map((line) => ({ lineId: line._id, receivedQuantity: line.quantity })) } }), 200);

  const returnRequest = expectStatus<{ return: { _id: string; returnNumber: string } }>("Manager create warehouse return", await api(`/manager/stores/${storeId}/warehouse-returns`, {
    method: "POST",
    token: managerSession.token,
    body: { inventoryItemId: demoMilk._id, quantity: 0.5, unit: demoMilk.purchaseUnit, reason: "Smoke test return", notes: "Return from receiving test" },
  }), 201);
  expectStatus("Admin warehouse return list", await api("/admin/warehouse/returns", { token: adminSession.token }), 200);
  expectStatus("Admin receive warehouse return", await api(`/admin/warehouse/returns/${returnRequest.return._id}/receive`, { method: "PATCH", token: adminSession.token, body: {} }), 200);
  expectStatus("Admin warehouse adjustment", await api("/admin/warehouse/adjustments", { method: "POST", token: adminSession.token, body: { inventoryItemId: demoMilk._id, quantityDelta: -1, locationType: "warehouse", reason: "Smoke test adjustment" } }), 201);
  const finalWarehouseStock = expectStatus<{ stock: Array<{ inventoryItemId: string; quantityOnHand: number }> }>("Final warehouse stock", await api("/admin/warehouse/stock", { token: adminSession.token }), 200);
  const finalMilk = finalWarehouseStock.stock.find((row) => row.inventoryItemId === demoMilk._id)!;
  expectStatus("Admin warehouse stock count", await api("/admin/warehouse/stock-counts", { method: "POST", token: adminSession.token, body: { inventoryItemId: demoMilk._id, physicalQuantity: finalMilk.quantityOnHand + 1, locationType: "warehouse", reason: "Smoke test count" } }), 201);
  expectStatus("Admin warehouse ledger", await api("/admin/warehouse/ledger", { token: adminSession.token }), 200);

  console.log(`Smoke test passed against ${baseUrl}`);
}

runSmokeTest().catch((error: unknown) => {
  console.error("Smoke test failed", error);
  process.exitCode = 1;
});
