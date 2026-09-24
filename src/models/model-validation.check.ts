import { Types } from "mongoose";
import {
  InventoryItemModel,
  InventoryRequestLineItemModel,
  InventoryRequestModel,
  ProductModel,
  RecipeModel,
  StationModel,
  StoreEmployeeModel,
  StoreModel,
  StoreStockModel,
  UserAccountModel,
} from "./index.js";
import { STORE_STATUSES, STORE_TYPES } from "./model.constants.js";
import { calculateSmallestUnitCostCents } from "../modules/admin/inventory-cost.js";

const id = () => new Types.ObjectId();

async function expectValid(name: string, document: { validate: () => Promise<unknown> }) {
  await document.validate();
  console.log(`ok valid ${name}`);
}

async function expectInvalid(name: string, document: { validate: () => Promise<unknown> }) {
  try {
    await document.validate();
  } catch {
    console.log(`ok invalid ${name}`);
    return;
  }

  throw new Error(`Expected ${name} to fail validation`);
}

async function run() {
  const storeId = id();
  const userAccountId = id();
  const storeEmployeeId = id();
  const stationId = id();
  const inventoryItemId = id();
  const inventoryRequestId = id();
  const recipeId = id();

  await expectValid(
    "store",
    new StoreModel({
      name: "JTC Downtown",
      code: "JTC-DT",
      slug: "jtc-downtown",
      timezone: "America/New_York",
    }),
  );

  for (const status of STORE_STATUSES) {
    await expectValid(
      `store status ${status}`,
      new StoreModel({
        name: `JTC ${status}`,
        code: `JTC-${status.replace(/_/g, "-").toUpperCase()}`.slice(0, 24),
        slug: `jtc-${status.replace(/_/g, "-")}`,
        status,
      }),
    );
  }

  for (const storeType of STORE_TYPES) {
    await expectValid(
      `store type ${storeType}`,
      new StoreModel({
        name: `JTC ${storeType}`,
        code: `JTC-${storeType.replace(/_/g, "-").toUpperCase()}`.slice(0, 24),
        slug: `jtc-${storeType.replace(/_/g, "-")}`,
        storeType,
      }),
    );
  }

  await expectValid(
    "user account",
    new UserAccountModel({
      email: "manager@example.com",
      displayName: "Store Manager",
      role: "manager",
      status: "active",
    }),
  );

  await expectValid(
    "store employee",
    new StoreEmployeeModel({
      storeId,
      userAccountId,
      role: "manager",
      status: "active",
      employeeCode: "MGR-1",
      contactPhone: "+1 555 0100",
    }),
  );

  await expectValid(
    "store employee without login account",
    new StoreEmployeeModel({
      storeId,
      displayName: "Cafe Barista",
      role: "barista",
      status: "active",
      employeeCode: "BAR-1",
      contactPhone: "+1 555 0101",
    }),
  );

  await expectValid(
    "station",
    new StationModel({
      storeId,
      name: "Front Counter",
      code: "FRONT",
    }),
  );

  await expectInvalid("station missing store", new StationModel({ name: "No Store", code: "NO-STORE" }));
  await expectInvalid("station missing name", new StationModel({ storeId, code: "NO-NAME" }));
  await expectInvalid(
    "station unsupported status",
    new StationModel({ storeId, name: "Bad Status", code: "BAD-STATUS", status: "open" }),
  );
  await expectInvalid(
    "station negative sort order",
    new StationModel({ storeId, name: "Bad Sort", code: "BAD-SORT", sortOrder: -1 }),
  );

  await expectValid(
    "inventory item",
    new InventoryItemModel({
      name: "Coffee Beans",
      sku: "COFFEE-BEAN",
      category: "Beverage",
      purchaseUnit: "case",
      baseUnit: "gram",
      packagingLevels: [
        { parentUnit: "case", childUnit: "box", quantity: 10 },
        { parentUnit: "box", childUnit: "gram", quantity: 500 },
      ],
      purchasePriceCents: 33600,
    }),
  );

  const smallestUnitCostCents = calculateSmallestUnitCostCents({
    purchaseUnit: "case",
    baseUnit: "gram",
    purchasePriceCents: 33600,
    packagingLevels: [
      { parentUnit: "case", childUnit: "box", quantity: 10 },
      { parentUnit: "box", childUnit: "gram", quantity: 500 },
    ],
  });

  if (smallestUnitCostCents !== 6.72) {
    throw new Error(`Expected smallest unit cost 6.72 cents, got ${smallestUnitCostCents}`);
  }

  console.log("ok inventory smallest unit cost");

  await expectInvalid(
    "inventory item missing purchase price",
    new InventoryItemModel({
      name: "Missing Price",
      sku: "MISSING-PRICE",
      category: "Beverage",
      purchaseUnit: "case",
      baseUnit: "gram",
    }),
  );
  await expectInvalid(
    "inventory item negative purchase price",
    new InventoryItemModel({
      name: "Negative Price",
      sku: "NEGATIVE-PRICE",
      category: "Beverage",
      purchaseUnit: "case",
      baseUnit: "gram",
      purchasePriceCents: -1,
    }),
  );
  await expectInvalid(
    "inventory item invalid packaging quantity",
    new InventoryItemModel({
      name: "Invalid Packaging",
      sku: "INVALID-PACKAGING",
      category: "Beverage",
      purchaseUnit: "case",
      baseUnit: "gram",
      packagingLevels: [{ parentUnit: "case", childUnit: "gram", quantity: 0 }],
      purchasePriceCents: 100,
    }),
  );

  await expectValid(
    "store stock",
    new StoreStockModel({
      storeId,
      inventoryItemId,
      quantityOnHand: 5000,
      reorderPoint: 1000,
      parLevel: 7000,
    }),
  );

  await expectValid(
    "inventory request",
    new InventoryRequestModel({
      storeId,
      requestNumber: "REQ-1001",
      requestedByEmployeeId: storeEmployeeId,
      stationId,
      status: "submitted",
      submittedAt: new Date(),
    }),
  );

  await expectValid(
    "inventory request line item",
    new InventoryRequestLineItemModel({
      storeId,
      inventoryRequestId,
      inventoryItemId,
      requestedQuantity: 10,
      approvedQuantity: 8,
      fulfilledQuantity: 4,
    }),
  );

  await expectValid(
    "recipe",
    new RecipeModel({
      name: "House Coffee",
      code: "HOUSE-COFFEE",
      status: "active",
      yieldQuantity: 1,
      yieldUnit: "each",
      ingredients: [{ inventoryItemId, quantity: 18, unit: "gram" }],
    }),
  );

  await expectValid(
    "product",
    new ProductModel({
      name: "House Coffee",
      sku: "DRINK-HOUSE-COFFEE",
      type: "prepared_item",
      status: "active",
      recipeId,
      priceCents: 350,
      category: "Drinks",
    }),
  );

  await expectInvalid(
    "product non-integer price",
    new ProductModel({
      name: "Fractional Price",
      sku: "FRACTIONAL-PRICE",
      priceCents: 125.5,
      category: "Drinks",
    }),
  );

  await expectInvalid("store missing code", new StoreModel({ name: "No Code", slug: "no-code" }));
  await expectInvalid(
    "store unsupported status",
    new StoreModel({ name: "Bad Status", code: "BAD-STATUS", slug: "bad-status", status: "active" }),
  );
  await expectInvalid(
    "store unsupported type",
    new StoreModel({ name: "Bad Type", code: "BAD-TYPE", slug: "bad-type", storeType: "express" }),
  );
  await expectInvalid(
    "other employee missing position title",
    new StoreEmployeeModel({
      storeId,
      displayName: "Flexible Employee",
      role: "other",
      status: "active",
    }),
  );
  await expectInvalid(
    "line item over-approved",
    new InventoryRequestLineItemModel({
      storeId,
      inventoryRequestId,
      inventoryItemId,
      requestedQuantity: 2,
      approvedQuantity: 3,
    }),
  );
  await expectInvalid(
    "recipe without ingredients",
    new RecipeModel({
      name: "Empty Recipe",
      code: "EMPTY",
      yieldQuantity: 1,
      yieldUnit: "each",
      ingredients: [],
    }),
  );
}

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
