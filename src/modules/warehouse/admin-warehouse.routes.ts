import { Router } from "express";
import { Types } from "mongoose";
import {
  InventoryItemModel,
  InventoryReturnModel,
  InventoryTransactionModel,
  InventoryTransferModel,
  StoreModel,
  StoreStockModel,
  UserAccountModel,
  WarehouseStockModel,
} from "../../models/index.js";
import {
  INVENTORY_RETURN_STATUSES,
  INVENTORY_UNITS,
  WAREHOUSE_TRANSFER_STATUSES,
  WAREHOUSE_TRANSACTION_TYPES,
  type WarehouseTransactionType,
} from "../../models/model.constants.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import {
  buildReturnDto,
  buildTransferDto,
  changeStock,
  getWarehouseStockRows,
  quantityInBaseUnits,
  transactionNumber,
} from "./warehouse.service.js";

export const adminWarehouseRouter = Router();
adminWarehouseRouter.use(requireAuth, requireRole("admin"));

function error(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

function requiredString(body: Record<string, unknown>, key: string, label: string) {
  const value = typeof body[key] === "string" ? body[key].trim() : "";
  if (!value) throw error(400, `${label} is required.`);
  return value;
}

function optionalString(body: Record<string, unknown>, key: string) {
  const value = typeof body[key] === "string" ? body[key].trim() : "";
  return value || undefined;
}

function requiredNumber(body: Record<string, unknown>, key: string, label: string) {
  const raw = body[key];
  const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value)) throw error(400, `${label} must be a valid number.`);
  return value;
}

function optionalDate(body: Record<string, unknown>, key: string) {
  const value = optionalString(body, key);
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw error(400, `${key} must be a valid date.`);
  return date;
}

function requiredObjectId(body: Record<string, unknown>, key: string, label: string) {
  const value = requiredString(body, key, label);
  if (!Types.ObjectId.isValid(value)) throw error(400, `${label} is not valid.`);
  return value;
}

async function getAdminItem(itemId: string) {
  if (!Types.ObjectId.isValid(itemId)) throw error(404, "Inventory item not found");
  const item = await InventoryItemModel.findById(itemId).lean();
  if (!item) throw error(404, "Inventory item not found");
  return item;
}

async function getAdminStore(storeId: string) {
  if (!Types.ObjectId.isValid(storeId)) throw error(404, "Store not found");
  const store = await StoreModel.findById(storeId).select("name code slug status").lean();
  if (!store) throw error(404, "Store not found");
  return store;
}

async function transactionDtos(transactions: any[]) {
  const itemIds = [...new Set(transactions.map((transaction) => String(transaction.inventoryItemId)))];
  const storeIds = [...new Set(transactions.filter((transaction) => transaction.locationId).map((transaction) => String(transaction.locationId)))];
  const [items, stores, users] = await Promise.all([
    InventoryItemModel.find({ _id: { $in: itemIds } }).select("name sku baseUnit").lean(),
    StoreModel.find({ _id: { $in: storeIds } }).select("name code").lean(),
    UserAccountModel.find({ _id: { $in: transactions.map((transaction) => transaction.performedByUserId) } }).select("displayName email").lean(),
  ]);
  const itemsById = new Map(items.map((item) => [String(item._id), item]));
  const storesById = new Map(stores.map((store) => [String(store._id), store]));
  const usersById = new Map(users.map((user) => [String(user._id), user]));
  return transactions.map((transaction) => ({
    _id: String(transaction._id),
    transactionNumber: transaction.transactionNumber,
    transactionType: transaction.transactionType,
    item: itemsById.get(String(transaction.inventoryItemId))
      ? { _id: String(itemsById.get(String(transaction.inventoryItemId))!._id), name: itemsById.get(String(transaction.inventoryItemId))!.name, sku: itemsById.get(String(transaction.inventoryItemId))!.sku, baseUnit: itemsById.get(String(transaction.inventoryItemId))!.baseUnit }
      : null,
    quantity: transaction.quantity,
    unit: transaction.unit,
    locationType: transaction.locationType,
    location: transaction.locationType === "warehouse" ? { code: "CENTRAL", name: "Central Warehouse" } : storesById.get(String(transaction.locationId)) ? { _id: String(transaction.locationId), name: storesById.get(String(transaction.locationId))!.name, storeNumber: storesById.get(String(transaction.locationId))!.code } : null,
    quantityBefore: transaction.quantityBefore,
    quantityAfter: transaction.quantityAfter,
    quantityDelta: transaction.quantityDelta,
    sourceLabel: transaction.sourceLabel,
    destinationLabel: transaction.destinationLabel,
    referenceNumber: transaction.referenceNumber,
    supplier: transaction.supplier,
    invoiceNumber: transaction.invoiceNumber,
    batchNumber: transaction.batchNumber,
    expiryDate: transaction.expiryDate,
    reason: transaction.reason,
    notes: transaction.notes,
    performedBy: usersById.get(String(transaction.performedByUserId)) ? { displayName: usersById.get(String(transaction.performedByUserId))!.displayName, email: usersById.get(String(transaction.performedByUserId))!.email } : null,
    createdAt: transaction.createdAt,
  }));
}

adminWarehouseRouter.get("/overview", async (req, res, next) => {
  try {
    const rows = await getWarehouseStockRows();
    const [recentTransactions, pendingTransfers, stores] = await Promise.all([
      InventoryTransactionModel.find().sort({ createdAt: -1 }).limit(8).lean(),
      InventoryTransferModel.countDocuments({ status: { $in: ["pending_approval", "approved", "dispatched", "partially_received"] } }),
      StoreModel.countDocuments({ isActive: true }),
    ]);
    const totalStockUnits = rows.reduce((total, row) => total + row.quantityOnHand, 0);
    const lowStock = rows.filter((row) => row.status === "low_stock").length;
    const outOfStock = rows.filter((row) => row.status === "out_of_stock").length;
    const inventoryValueCents = rows.reduce((total, row) => total + row.quantityOnHand * (row.item?.smallestUnitCostCents ?? 0), 0);
    const categoryTotals = new Map<string, number>();
    for (const row of rows) categoryTotals.set(row.item?.category ?? "Uncategorized", (categoryTotals.get(row.item?.category ?? "Uncategorized") ?? 0) + row.quantityOnHand);

    res.json({
      warehouse: { code: "CENTRAL", name: "Central Warehouse" },
      counts: { products: rows.length, totalStockUnits, lowStockProducts: lowStock, outOfStockProducts: outOfStock, pendingTransfers, activeStores: stores },
      inventoryValueCents,
      categories: [...categoryTotals.entries()].map(([category, quantity]) => ({ category, quantity })),
      recentTransactions: await transactionDtos(recentTransactions),
    });
  } catch (caught) {
    next(caught);
  }
});

adminWarehouseRouter.get("/stock", async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim().toLowerCase() : "";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const rows = (await getWarehouseStockRows()).filter((row) => {
      const searchable = `${row.item?.name ?? ""} ${row.item?.sku ?? ""} ${row.item?.barcode ?? ""}`.toLowerCase();
      return (!search || searchable.includes(search)) && (!category || row.item?.category.toLowerCase() === category) && (!status || row.status === status);
    });
    res.json({ warehouse: { code: "CENTRAL", name: "Central Warehouse" }, stock: rows });
  } catch (caught) {
    next(caught);
  }
});

adminWarehouseRouter.get("/store-stock", async (req, res, next) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (storeId) await getAdminStore(storeId);
    const filter = storeId ? { storeId } : {};
    const stocks = await StoreStockModel.find(filter).sort({ status: 1, updatedAt: -1 }).lean();
    const itemIds = stocks.map((stock) => stock.inventoryItemId);
    const [items, stores] = await Promise.all([
      InventoryItemModel.find({ _id: { $in: itemIds } }).select("name sku category baseUnit purchaseUnit minimumStockLevel").lean(),
      StoreModel.find({ _id: { $in: stocks.map((stock) => stock.storeId) } }).select("name code slug status").lean(),
    ]);
    const itemsById = new Map(items.map((item) => [String(item._id), item]));
    const storesById = new Map(stores.map((store) => [String(store._id), store]));
    res.json({
      inventory: stocks.map((stock) => ({
        _id: String(stock._id), inventoryItemId: String(stock.inventoryItemId), quantityOnHand: stock.quantityOnHand, reorderPoint: stock.reorderPoint, parLevel: stock.parLevel, status: stock.status,
        store: storesById.get(String(stock.storeId)) ? { _id: String(stock.storeId), name: storesById.get(String(stock.storeId))!.name, storeNumber: storesById.get(String(stock.storeId))!.code, slug: storesById.get(String(stock.storeId))!.slug } : null,
        item: itemsById.get(String(stock.inventoryItemId)) ?? null,
      })),
    });
  } catch (caught) {
    next(caught);
  }
});

adminWarehouseRouter.get("/ledger", async (req, res, next) => {
  try {
    const query: Record<string, unknown> = {};
    if (typeof req.query.transactionType === "string" && WAREHOUSE_TRANSACTION_TYPES.includes(req.query.transactionType as WarehouseTransactionType)) query.transactionType = req.query.transactionType;
    if (typeof req.query.itemId === "string" && Types.ObjectId.isValid(req.query.itemId)) query.inventoryItemId = req.query.itemId;
    if (req.query.locationType === "warehouse") query.locationType = "warehouse";
    if (req.query.locationType === "store") query.locationType = "store";
    if (typeof req.query.storeId === "string" && Types.ObjectId.isValid(req.query.storeId)) query.locationId = req.query.storeId;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 100), 1), 250);
    const transactions = await InventoryTransactionModel.find(query).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ transactions: await transactionDtos(transactions) });
  } catch (caught) {
    next(caught);
  }
});

adminWarehouseRouter.post("/receipts", async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const itemId = requiredObjectId(body, "inventoryItemId", "Product");
    const item = await getAdminItem(itemId);
    const quantity = requiredNumber(body, "quantity", "Quantity");
    const unit = optionalString(body, "unit") ?? item.purchaseUnit;
    if (quantity <= 0 || !INVENTORY_UNITS.includes(unit as (typeof INVENTORY_UNITS)[number])) throw error(400, "Quantity and unit are invalid.");
    const quantityInBase = quantityInBaseUnits(item, quantity, unit);
    const result = await changeStock({
      itemId, location: { type: "warehouse" }, delta: quantityInBase, transactionType: "warehouse_receiving", userId: req.auth!.sub,
      referenceNumber: optionalString(body, "referenceNumber"), sourceLabel: optionalString(body, "supplier") ?? "Supplier", destinationLabel: "Central Warehouse",
      supplier: optionalString(body, "supplier"), invoiceNumber: optionalString(body, "invoiceNumber"), batchNumber: optionalString(body, "batchNumber"), expiryDate: optionalDate(body, "expiryDate"), notes: optionalString(body, "notes"),
    });
    res.status(201).json({ receipt: { transactionNumber: result.transaction.transactionNumber, itemId, quantity, unit, quantityInBaseUnits: quantityInBase, warehouseQuantity: result.after } });
  } catch (caught) {
    next(caught);
  }
});

adminWarehouseRouter.post("/adjustments", async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const itemId = requiredObjectId(body, "inventoryItemId", "Product");
    const delta = requiredNumber(body, "quantityDelta", "Quantity change");
    const reason = requiredString(body, "reason", "Reason");
    const locationType = optionalString(body, "locationType") === "store" ? "store" : "warehouse";
    const storeId = locationType === "store" ? requiredObjectId(body, "storeId", "Store") : undefined;
    const transactionType = optionalString(body, "transactionType") ?? "adjustment";
    if (!["adjustment", "damage", "loss", "consumption", "sale"].includes(transactionType)) throw error(400, "Unsupported adjustment type.");
    const result = await changeStock({ itemId, location: { type: locationType, id: storeId }, delta, transactionType: transactionType as WarehouseTransactionType, userId: req.auth!.sub, reason, referenceNumber: optionalString(body, "referenceNumber"), notes: optionalString(body, "notes"), sourceLabel: locationType === "warehouse" ? "Central Warehouse" : "Store", destinationLabel: "Inventory balance" });
    res.status(201).json({ adjustment: { transactionNumber: result.transaction.transactionNumber, quantityBefore: result.before, quantityAfter: result.after, quantityDelta: delta } });
  } catch (caught) {
    next(caught);
  }
});

adminWarehouseRouter.post("/stock-counts", async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const itemId = requiredObjectId(body, "inventoryItemId", "Product");
    const physicalQuantity = requiredNumber(body, "physicalQuantity", "Physical quantity");
    if (physicalQuantity < 0) throw error(400, "Physical quantity cannot be negative.");
    const locationType = optionalString(body, "locationType") === "store" ? "store" : "warehouse";
    const storeId = locationType === "store" ? requiredObjectId(body, "storeId", "Store") : undefined;
    const current = await (locationType === "warehouse" ? WarehouseStockModel.findOne({ warehouseCode: "CENTRAL", inventoryItemId: itemId }) : StoreStockModel.findOne({ storeId, inventoryItemId: itemId }));
    const delta = physicalQuantity - (current?.quantityOnHand ?? 0);
    if (delta === 0) throw error(400, "Physical quantity matches the system quantity; no adjustment is needed.");
    const result = await changeStock({ itemId, location: { type: locationType, id: storeId }, delta, transactionType: "stock_count", userId: req.auth!.sub, reason: requiredString(body, "reason", "Reason"), notes: optionalString(body, "notes") });
    res.status(201).json({ stockCount: { transactionNumber: result.transaction.transactionNumber, systemQuantity: current?.quantityOnHand ?? 0, physicalQuantity, difference: delta, quantityAfter: result.after } });
  } catch (caught) {
    next(caught);
  }
});

adminWarehouseRouter.get("/transfers", async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = {};
    if (typeof req.query.status === "string" && WAREHOUSE_TRANSFER_STATUSES.includes(req.query.status as (typeof WAREHOUSE_TRANSFER_STATUSES)[number])) filter.status = req.query.status;
    if (typeof req.query.storeId === "string" && Types.ObjectId.isValid(req.query.storeId)) filter.destinationStoreId = req.query.storeId;
    const transfers = await InventoryTransferModel.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ transfers: await Promise.all(transfers.map(buildTransferDto)) });
  } catch (caught) {
    next(caught);
  }
});

adminWarehouseRouter.post("/transfers", async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const destinationStoreId = requiredObjectId(body, "destinationStoreId", "Destination store");
    await getAdminStore(destinationStoreId);
    if (!Array.isArray(body.lines) || body.lines.length === 0) throw error(400, "Add at least one product to the transfer.");
    const lines = [];
    for (const rawLine of body.lines) {
      if (!rawLine || typeof rawLine !== "object") throw error(400, "Transfer line is invalid.");
      const line = rawLine as Record<string, unknown>;
      const inventoryItemId = requiredObjectId(line, "inventoryItemId", "Product");
      const item = await getAdminItem(inventoryItemId);
      const quantity = requiredNumber(line, "quantity", "Quantity");
      const unit = typeof line.unit === "string" && line.unit.trim() ? line.unit.trim() : item.baseUnit;
      if (quantity <= 0 || !INVENTORY_UNITS.includes(unit as (typeof INVENTORY_UNITS)[number])) throw error(400, "Transfer quantity or unit is invalid.");
      lines.push({ inventoryItemId, quantity, unit });
    }
    const transfer = await InventoryTransferModel.create({ transferNumber: transactionNumber("TR"), destinationStoreId, status: "pending_approval", lines, requestedByUserId: req.auth!.sub, notes: optionalString(body, "notes") });
    res.status(201).json({ transfer: await buildTransferDto(transfer.toObject()) });
  } catch (caught) {
    next(caught);
  }
});

adminWarehouseRouter.patch("/transfers/:transferId/decision", async (req, res, next) => {
  try {
    const transfer = await InventoryTransferModel.findById(req.params.transferId);
    if (!transfer) throw error(404, "Transfer not found");
    if (transfer.status !== "pending_approval") throw error(409, "Only pending transfers can be approved or rejected.");
    const decision = requiredString(req.body as Record<string, unknown>, "decision", "Decision");
    if (decision !== "approve" && decision !== "reject") throw error(400, "Decision must be approve or reject.");
    if (decision === "approve") {
      for (const line of transfer.lines) {
        const item = await getAdminItem(String(line.inventoryItemId));
        const stock = await WarehouseStockModel.findOne({ warehouseCode: "CENTRAL", inventoryItemId: line.inventoryItemId }).lean();
        const required = quantityInBaseUnits(item, line.quantity, line.unit);
        if ((stock?.quantityOnHand ?? 0) < required) throw error(409, `Insufficient warehouse inventory for ${item.name}. Available: ${stock?.quantityOnHand ?? 0}. Requested: ${required}.`);
      }
    }
    transfer.set({ status: decision === "approve" ? "approved" : "rejected", approvedByUserId: req.auth!.sub, approvedAt: new Date(), notes: optionalString(req.body as Record<string, unknown>, "notes") ?? transfer.notes });
    await transfer.save();
    res.json({ transfer: await buildTransferDto(transfer.toObject()) });
  } catch (caught) {
    next(caught);
  }
});

adminWarehouseRouter.patch("/transfers/:transferId/dispatch", async (req, res, next) => {
  try {
    const transfer = await InventoryTransferModel.findById(req.params.transferId);
    if (!transfer) throw error(404, "Transfer not found");
    if (transfer.status !== "approved") throw error(409, "Only approved transfers can be dispatched.");
    const destination = await getAdminStore(String(transfer.destinationStoreId));
    const prepared: Array<{ itemId: string; quantity: number; originalQuantity: number; unit: string }> = [];
    for (const line of transfer.lines) {
      const item = await getAdminItem(String(line.inventoryItemId));
      const quantity = quantityInBaseUnits(item, line.quantity, line.unit);
      const stock = await WarehouseStockModel.findOne({ warehouseCode: "CENTRAL", inventoryItemId: line.inventoryItemId }).lean();
      if ((stock?.quantityOnHand ?? 0) < quantity) throw error(409, `Insufficient warehouse inventory for ${item.name}. Available: ${stock?.quantityOnHand ?? 0}. Requested: ${quantity}.`);
      prepared.push({ itemId: String(line.inventoryItemId), quantity, originalQuantity: line.quantity, unit: line.unit });
    }
    for (const line of prepared) await changeStock({ itemId: line.itemId, location: { type: "warehouse" }, delta: -line.quantity, transactionType: "store_transfer", userId: req.auth!.sub, referenceNumber: transfer.transferNumber, sourceLabel: "Central Warehouse", destinationLabel: destination.name, relatedTransferId: String(transfer._id), notes: `Dispatched ${line.originalQuantity} ${line.unit}.` });
    transfer.set({ status: "dispatched", dispatchedByUserId: req.auth!.sub, dispatchedAt: new Date() });
    await transfer.save();
    res.json({ transfer: await buildTransferDto(transfer.toObject()) });
  } catch (caught) {
    next(caught);
  }
});

adminWarehouseRouter.get("/returns", async (req, res, next) => {
  try {
    const filter = typeof req.query.status === "string" && INVENTORY_RETURN_STATUSES.includes(req.query.status as (typeof INVENTORY_RETURN_STATUSES)[number]) ? { status: req.query.status } : {};
    const returns = await InventoryReturnModel.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ returns: await Promise.all(returns.map(buildReturnDto)) });
  } catch (caught) {
    next(caught);
  }
});

adminWarehouseRouter.patch("/returns/:returnId/receive", async (req, res, next) => {
  try {
    const returnRecord = await InventoryReturnModel.findById(req.params.returnId);
    if (!returnRecord) throw error(404, "Return not found");
    if (returnRecord.status !== "pending") throw error(409, "Only pending returns can be received.");
    const item = await getAdminItem(String(returnRecord.inventoryItemId));
    const store = await getAdminStore(String(returnRecord.storeId));
    const quantity = quantityInBaseUnits(item, returnRecord.quantity, returnRecord.unit);
    const storeStock = await StoreStockModel.findOne({ storeId: returnRecord.storeId, inventoryItemId: returnRecord.inventoryItemId }).lean();
    if ((storeStock?.quantityOnHand ?? 0) < quantity) throw error(409, `Store stock is insufficient. Available: ${storeStock?.quantityOnHand ?? 0}. Requested: ${quantity}.`);
    await changeStock({ itemId: String(returnRecord.inventoryItemId), location: { type: "store", id: String(returnRecord.storeId) }, delta: -quantity, transactionType: "store_return", userId: req.auth!.sub, referenceNumber: returnRecord.returnNumber, sourceLabel: store.name, destinationLabel: "Central Warehouse", relatedReturnId: String(returnRecord._id), reason: returnRecord.reason });
    await changeStock({ itemId: String(returnRecord.inventoryItemId), location: { type: "warehouse" }, delta: quantity, transactionType: "warehouse_return", userId: req.auth!.sub, referenceNumber: returnRecord.returnNumber, sourceLabel: store.name, destinationLabel: "Central Warehouse", relatedReturnId: String(returnRecord._id), reason: returnRecord.reason });
    returnRecord.set({ status: "received", receivedByUserId: req.auth!.sub, receivedAt: new Date() });
    await returnRecord.save();
    res.json({ return: await buildReturnDto(returnRecord.toObject()) });
  } catch (caught) {
    next(caught);
  }
});
