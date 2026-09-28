import "dotenv/config";
import mongoose from "mongoose";
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
  WarehouseStockModel,
} from "../models/index.js";
import { config } from "../config/env.js";
import { hashPassword } from "../modules/auth/password.service.js";

const demoAdminEmail = "demo.admin@jtc.local";
const demoManagerEmail = "demo.manager@jtc.local";

function requiredDemoPassword(key: "JTC_DEMO_ADMIN_PASSWORD" | "JTC_DEMO_MANAGER_PASSWORD") {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Set ${key} before seeding demo data.`);
  }
  return value;
}

const demoAdminPassword = requiredDemoPassword("JTC_DEMO_ADMIN_PASSWORD");
const demoManagerPassword = requiredDemoPassword("JTC_DEMO_MANAGER_PASSWORD");

async function seedDemoData() {
  await mongoose.connect(config.mongodbUri);

  const [adminPasswordHash, managerPasswordHash] = await Promise.all([
    hashPassword(demoAdminPassword),
    hashPassword(demoManagerPassword),
  ]);

  const primaryStore = await StoreModel.findOneAndUpdate(
    { code: "DEMO-001" },
    {
      $set: {
        name: "JTC Demo Downtown",
        slug: "jtc-demo-downtown",
        storeType: "flagship",
        status: "open",
        isActive: true,
        timezone: "Asia/Karachi",
        address: {
          line1: "1 Demo Avenue",
          city: "Lahore",
          region: "Punjab",
          postalCode: "54000",
          country: "Pakistan",
        },
        phone: "+92-300-0000001",
        email: "demo.downtown@jtc.local",
        manager: "Demo Store Manager",
      },
      $setOnInsert: { code: "DEMO-001" },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  const secondaryStore = await StoreModel.findOneAndUpdate(
    { code: "DEMO-002" },
    {
      $set: {
        name: "JTC Demo Airport",
        slug: "jtc-demo-airport",
        storeType: "kiosk",
        status: "open",
        isActive: true,
        timezone: "Asia/Karachi",
        address: {
          line1: "2 Demo Terminal Road",
          city: "Lahore",
          region: "Punjab",
          postalCode: "54000",
          country: "Pakistan",
        },
        email: "demo.airport@jtc.local",
      },
      $setOnInsert: { code: "DEMO-002" },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  const admin = await UserAccountModel.findOneAndUpdate(
    { email: demoAdminEmail },
    {
      $set: {
        displayName: "Demo Admin",
        role: "admin",
        status: "active",
        passwordHash: adminPasswordHash,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  const manager = await UserAccountModel.findOneAndUpdate(
    { email: demoManagerEmail },
    {
      $set: {
        displayName: "Demo Store Manager",
        role: "manager",
        status: "active",
        passwordHash: managerPasswordHash,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  const managerEmployee = await StoreEmployeeModel.findOneAndUpdate(
    { storeId: primaryStore!._id, userAccountId: manager!._id },
    {
      $set: {
        displayName: "Demo Store Manager",
        email: demoManagerEmail,
        role: "manager",
        status: "active",
        employeeCode: "DEMO-MGR-001",
        contactPhone: "+92-300-0000002",
        hiredAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  const employee = await StoreEmployeeModel.findOneAndUpdate(
    { storeId: primaryStore!._id, employeeCode: "DEMO-EMP-001" },
    {
      $set: {
        displayName: "Demo Barista",
        email: "demo.barista@jtc.local",
        role: "barista",
        status: "active",
        positionTitle: undefined,
        contactPhone: "+92-300-0000003",
        hiredAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  const prepStation = await StationModel.findOneAndUpdate(
    { storeId: primaryStore!._id, code: "DEMO-PREP" },
    { $set: { name: "Demo Prep Station", status: "active", sortOrder: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  const beans = await InventoryItemModel.findOneAndUpdate(
    { sku: "DEMO-BEAN" },
    {
      $set: {
        name: "Demo Espresso Beans",
        category: "Coffee",
        purchaseUnit: "case",
        baseUnit: "gram",
        packagingLevels: [
          { parentUnit: "case", childUnit: "kilogram", quantity: 10 },
          { parentUnit: "kilogram", childUnit: "gram", quantity: 1000 },
        ],
        purchasePriceCents: 120000,
        status: "active",
        description: "Demo cost-source inventory item.",
      },
      $setOnInsert: { sku: "DEMO-BEAN" },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  const milk = await InventoryItemModel.findOneAndUpdate(
    { sku: "DEMO-MILK" },
    {
      $set: {
        name: "Demo Whole Milk",
        category: "Dairy",
        purchaseUnit: "liter",
        baseUnit: "milliliter",
        packagingLevels: [{ parentUnit: "liter", childUnit: "milliliter", quantity: 1000 }],
        purchasePriceCents: 350,
        status: "active",
        description: "Demo cost-source inventory item.",
      },
      $setOnInsert: { sku: "DEMO-MILK" },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  await Promise.all([
    StoreStockModel.findOneAndUpdate(
      { storeId: primaryStore!._id, inventoryItemId: beans!._id },
      { $set: { quantityOnHand: 20, reorderPoint: 5, parLevel: 30, status: "in_stock" } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ),
    StoreStockModel.findOneAndUpdate(
      { storeId: primaryStore!._id, inventoryItemId: milk!._id },
      { $set: { quantityOnHand: 40, reorderPoint: 10, parLevel: 60, status: "in_stock" } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ),
    WarehouseStockModel.findOneAndUpdate(
      { warehouseCode: "CENTRAL", inventoryItemId: beans!._id },
      { $set: { quantityOnHand: 150000, reorderPoint: 30000, parLevel: 200000, status: "in_stock" } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ),
    WarehouseStockModel.findOneAndUpdate(
      { warehouseCode: "CENTRAL", inventoryItemId: milk!._id },
      { $set: { quantityOnHand: 50000, reorderPoint: 10000, parLevel: 70000, status: "in_stock" } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ),
  ]);

  const recipe = await RecipeModel.findOneAndUpdate(
    { code: "DEMO-LATTE", version: 1 },
    {
      $set: {
        name: "Demo Latte",
        status: "active",
        yieldQuantity: 1,
        yieldUnit: "each",
        ingredients: [
          { inventoryItemId: beans!._id, quantity: 18, unit: "gram", preparationNote: "Use the demo espresso blend." },
          { inventoryItemId: milk!._id, quantity: 200, unit: "milliliter", preparationNote: "Steam until ready for service." },
        ],
      },
      $setOnInsert: { code: "DEMO-LATTE", version: 1 },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  const product = await ProductModel.findOneAndUpdate(
    { sku: "DEMO-LATTE" },
    {
      $set: {
        name: "Demo Latte",
        type: "prepared_item",
        status: "active",
        recipeId: recipe!._id,
        priceCents: 650,
        laborCostCents: 50,
        otherCostCents: 20,
        category: "Beverages",
        description: "Demo sellable product linked to the Demo Latte recipe.",
      },
      $setOnInsert: { sku: "DEMO-LATTE" },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  const request = await InventoryRequestModel.findOneAndUpdate(
    { storeId: primaryStore!._id, requestNumber: "DEMO-REQ-001" },
    {
      $set: {
        status: "submitted",
        requestedByEmployeeId: managerEmployee!._id,
        stationId: prepStation!._id,
        submittedAt: new Date(),
        notes: "Demo request for the Admin approval and fulfillment flow.",
        resolvedByEmployeeId: undefined,
        resolvedAt: undefined,
      },
      $setOnInsert: { requestNumber: "DEMO-REQ-001" },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  await InventoryRequestLineItemModel.findOneAndUpdate(
    { inventoryRequestId: request!._id, inventoryItemId: milk!._id },
    {
      $set: {
        storeId: primaryStore!._id,
        requestedQuantity: 2,
        approvedQuantity: undefined,
        fulfilledQuantity: 0,
        status: "pending",
        notes: "Demo request line.",
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  console.log(JSON.stringify({
    message: "Demo data seeded without deleting existing records.",
    credentials: {
      adminEmail: demoAdminEmail,
      managerEmail: demoManagerEmail,
      passwordsProvidedByEnvironment: true,
    },
    ids: {
      adminId: String(admin!._id),
      managerId: String(manager!._id),
      primaryStoreId: String(primaryStore!._id),
      secondaryStoreId: String(secondaryStore!._id),
      managerEmployeeId: String(managerEmployee!._id),
      employeeId: String(employee!._id),
      stationId: String(prepStation!._id),
      beansInventoryId: String(beans!._id),
      milkInventoryId: String(milk!._id),
      recipeId: String(recipe!._id),
      productId: String(product!._id),
      requestId: String(request!._id),
    },
  }, null, 2));
}

seedDemoData()
  .catch((error: unknown) => {
    console.error("Demo data seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
