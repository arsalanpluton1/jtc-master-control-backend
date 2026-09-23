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

  await expectValid(
    "inventory item",
    new InventoryItemModel({
      name: "Coffee Beans",
      sku: "COFFEE-BEAN",
      category: "Beverage",
      baseUnit: "gram",
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

  await expectInvalid("store missing code", new StoreModel({ name: "No Code", slug: "no-code" }));
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
