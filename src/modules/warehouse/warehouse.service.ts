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
import { WAREHOUSE_CODE, type WarehouseTransactionType } from "../../models/model.constants.js";
import { calculateSmallestUnitCostCents } from "../admin/inventory-cost.js";

export type WarehouseLocation = {
  type: "warehouse" | "store";
  id?: string;
};

export type StockChangeInput = {
  itemId: string;
  location: WarehouseLocation;
  delta: number;
  transactionType: WarehouseTransactionType;
  userId: string;
  referenceNumber?: string;
  sourceLabel?: string;
  destinationLabel?: string;
  reason?: string;
  notes?: string;
  relatedTransferId?: string;
  relatedReturnId?: string;
  supplier?: string;
  invoiceNumber?: string;
  batchNumber?: string;
  expiryDate?: Date;
};

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

function transactionNumber(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function stockStatus(quantity: number, reorderPoint: number, currentStatus?: string) {
  if (currentStatus === "inactive") return "inactive";
  if (quantity <= 0) return "out_of_stock";
  if (reorderPoint > 0 && quantity <= reorderPoint) return "low_stock";
  return "in_stock";
}

async function getItem(itemId: string) {
  if (!Types.ObjectId.isValid(itemId)) throw httpError(404, "Inventory item not found");
  const item = await InventoryItemModel.findById(itemId).lean();
  if (!item) throw httpError(404, "Inventory item not found");
  return item;
}

export function quantityInBaseUnits(item: { purchaseUnit?: string; baseUnit: string; packagingLevels?: Array<{ parentUnit: string; childUnit: string; quantity: number }> }, quantity: number, unit: string) {
  if (!Number.isFinite(quantity) || quantity < 0) throw httpError(400, "Quantity must be zero or greater.");
  if (unit === item.baseUnit) return quantity;
  const levelsByParent = new Map((item.packagingLevels ?? []).map((level) => [level.parentUnit, level]));
  const visited = new Set<string>();
  let currentUnit = unit;
  let multiplier = 1;
  while (currentUnit !== item.baseUnit) {
    if (visited.has(currentUnit)) throw httpError(400, "Packaging conversion contains a cycle.");
    visited.add(currentUnit);
    const level = levelsByParent.get(currentUnit);
    if (!level || !Number.isInteger(level.quantity) || level.quantity < 1) throw httpError(400, `No packaging conversion exists from ${unit} to ${item.baseUnit}.`);
    multiplier *= level.quantity;
    if (!Number.isSafeInteger(multiplier)) throw httpError(400, "Packaging conversion is too large.");
    currentUnit = level.childUnit;
  }
  return quantity * multiplier;
}

async function getStore(storeId: string) {
  if (!Types.ObjectId.isValid(storeId)) throw httpError(404, "Store not found");
  const store = await StoreModel.findById(storeId).select("name code slug status isActive").lean();
  if (!store) throw httpError(404, "Store not found");
  return store;
}

export async function getLocationStock(location: WarehouseLocation, itemId: string) {
  if (location.type === "warehouse") {
    return WarehouseStockModel.findOne({ warehouseCode: WAREHOUSE_CODE, inventoryItemId: itemId });
  }

  if (!location.id) throw httpError(400, "Store is required for store stock");
  return StoreStockModel.findOne({ storeId: location.id, inventoryItemId: itemId });
}

export async function changeStock(input: StockChangeInput) {
  if (!Number.isFinite(input.delta) || input.delta === 0) throw httpError(400, "Stock change must not be zero");
  const item = await getItem(input.itemId);
  if (input.location.type === "store" && input.location.id) await getStore(input.location.id);

  const existing = await getLocationStock(input.location, input.itemId);
  const before = existing?.quantityOnHand ?? 0;
  const after = before + input.delta;
  if (after < 0) {
    throw httpError(409, `Insufficient inventory. Available: ${before}. Requested: ${Math.abs(input.delta)}`);
  }

  const reorderPoint = existing?.reorderPoint ?? item.minimumStockLevel ?? 0;
  const parLevel = existing?.parLevel ?? item.maximumStockLevel ?? 0;
  const nextStatus = stockStatus(after, reorderPoint, existing?.status);

  if (input.location.type === "warehouse") {
    await WarehouseStockModel.findOneAndUpdate(
      { warehouseCode: WAREHOUSE_CODE, inventoryItemId: input.itemId },
      { $set: { quantityOnHand: after, reorderPoint, parLevel, status: nextStatus } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
  } else {
    await StoreStockModel.findOneAndUpdate(
      { storeId: input.location.id, inventoryItemId: input.itemId },
      { $set: { quantityOnHand: after, reorderPoint, parLevel, status: nextStatus } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }

  const transaction = await InventoryTransactionModel.create({
    transactionNumber: transactionNumber("INV"),
    transactionType: input.transactionType,
    inventoryItemId: input.itemId,
    quantity: Math.abs(input.delta),
    unit: item.baseUnit,
    locationType: input.location.type,
    locationId: input.location.type === "store" ? input.location.id : undefined,
    quantityBefore: before,
    quantityAfter: after,
    quantityDelta: input.delta,
    sourceLabel: input.sourceLabel,
    destinationLabel: input.destinationLabel,
    referenceNumber: input.referenceNumber,
    reason: input.reason,
    notes: input.notes,
    relatedTransferId: input.relatedTransferId,
    relatedReturnId: input.relatedReturnId,
    supplier: input.supplier,
    invoiceNumber: input.invoiceNumber,
    batchNumber: input.batchNumber,
    expiryDate: input.expiryDate,
    performedByUserId: input.userId,
  });

  return { item, before, after, transaction };
}

export async function getWarehouseStockRows() {
  const stocks = await WarehouseStockModel.find({ warehouseCode: WAREHOUSE_CODE }).sort({ status: 1, updatedAt: -1 }).lean();
  const items = await InventoryItemModel.find({ status: { $ne: "discontinued" } }).sort({ category: 1, name: 1 }).lean();
  const stocksByItemId = new Map(stocks.map((stock) => [String(stock.inventoryItemId), stock]));

  return items.map((item) => {
    const stock = stocksByItemId.get(String(item._id));
    const quantityOnHand = stock?.quantityOnHand ?? 0;
    const reorderPoint = stock?.reorderPoint ?? item.minimumStockLevel ?? 0;
    return {
      _id: stock ? String(stock._id) : `warehouse-${String(item._id)}`,
      warehouseCode: WAREHOUSE_CODE,
      inventoryItemId: String(item._id),
      quantityOnHand,
      reorderPoint,
      parLevel: stock?.parLevel ?? item.maximumStockLevel ?? 0,
      status: stockStatus(quantityOnHand, reorderPoint, stock?.status),
      item: {
            _id: String(item._id),
            name: item.name,
            sku: item.sku,
            barcode: item.barcode ?? null,
            category: item.category,
            subcategory: item.subcategory ?? null,
            supplier: item.supplier ?? null,
            baseUnit: item.baseUnit,
            purchaseUnit: item.purchaseUnit,
            purchasePriceCents: item.purchasePriceCents,
            smallestUnitCostCents: calculateSmallestUnitCostCents(item),
            minimumStockLevel: item.minimumStockLevel ?? 0,
            maximumStockLevel: item.maximumStockLevel ?? null,
          },
      updatedAt: stock?.updatedAt,
    };
  });
}

export async function buildTransferDto(transfer: any) {
  const store = await StoreModel.findById(transfer.destinationStoreId).select("name code slug status").lean();
  const itemIds = transfer.lines.map((line: any) => line.inventoryItemId);
  const items = await InventoryItemModel.find({ _id: { $in: itemIds } }).select("name sku baseUnit purchaseUnit").lean();
  const itemsById = new Map(items.map((item) => [String(item._id), item]));
  return {
    _id: String(transfer._id),
    transferNumber: transfer.transferNumber,
    status: transfer.status,
    store: store
      ? { _id: String(store._id), name: store.name, storeNumber: store.code, slug: store.slug, status: store.status }
      : null,
    lines: transfer.lines.map((line: any) => ({
      _id: String(line._id),
      inventoryItemId: String(line.inventoryItemId),
      item: itemsById.get(String(line.inventoryItemId))
        ? {
            _id: String(itemsById.get(String(line.inventoryItemId))!._id),
            name: itemsById.get(String(line.inventoryItemId))!.name,
            sku: itemsById.get(String(line.inventoryItemId))!.sku,
            baseUnit: itemsById.get(String(line.inventoryItemId))!.baseUnit,
            purchaseUnit: itemsById.get(String(line.inventoryItemId))!.purchaseUnit,
          }
        : null,
      quantity: line.quantity,
      unit: line.unit,
      receivedQuantity: line.receivedQuantity ?? 0,
      discrepancyReason: line.discrepancyReason ?? null,
    })),
    requestedAt: transfer.requestedAt,
    approvedAt: transfer.approvedAt,
    dispatchedAt: transfer.dispatchedAt,
    receivedAt: transfer.receivedAt,
    notes: transfer.notes,
    createdAt: transfer.createdAt,
    updatedAt: transfer.updatedAt,
  };
}

export async function buildReturnDto(returnRecord: any) {
  const [store, item, creator] = await Promise.all([
    StoreModel.findById(returnRecord.storeId).select("name code slug status").lean(),
    InventoryItemModel.findById(returnRecord.inventoryItemId).select("name sku baseUnit").lean(),
    UserAccountModel.findById(returnRecord.createdByUserId).select("displayName email").lean(),
  ]);
  return {
    _id: String(returnRecord._id),
    returnNumber: returnRecord.returnNumber,
    status: returnRecord.status,
    store: store ? { _id: String(store._id), name: store.name, storeNumber: store.code, slug: store.slug } : null,
    item: item ? { _id: String(item._id), name: item.name, sku: item.sku, baseUnit: item.baseUnit } : null,
    quantity: returnRecord.quantity,
    unit: returnRecord.unit,
    reason: returnRecord.reason,
    notes: returnRecord.notes,
    createdBy: creator ? { _id: String(creator._id), displayName: creator.displayName, email: creator.email } : null,
    receivedAt: returnRecord.receivedAt,
    createdAt: returnRecord.createdAt,
    updatedAt: returnRecord.updatedAt,
  };
}

export { InventoryReturnModel, InventoryTransactionModel, InventoryTransferModel, WAREHOUSE_CODE, transactionNumber };
