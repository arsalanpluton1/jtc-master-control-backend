import { Router } from "express";
import { Types } from "mongoose";
import {
  InventoryItemModel,
  InventoryReturnModel,
  InventoryTransactionModel,
  InventoryTransferModel,
  StoreStockModel,
} from "../../models/index.js";
import { INVENTORY_UNITS } from "../../models/model.constants.js";
import { assertStoreAccess, requireAuth, requireRole } from "../auth/auth.middleware.js";
import { buildReturnDto, buildTransferDto, changeStock, quantityInBaseUnits, transactionNumber } from "./warehouse.service.js";

export const managerWarehouseRouter = Router();
managerWarehouseRouter.use(requireAuth, requireRole("admin", "manager"));

function error(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

function requiredString(body: Record<string, unknown>, key: string, label: string) {
  const value = typeof body[key] === "string" ? body[key].trim() : "";
  if (!value) throw error(400, `${label} is required.`);
  return value;
}

function requiredNumber(body: Record<string, unknown>, key: string, label: string) {
  const raw = body[key];
  const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value)) throw error(400, `${label} must be a valid number.`);
  return value;
}

managerWarehouseRouter.get("/stores/:storeId/inventory-transfers", assertStoreAccess, async (req, res, next) => {
  try {
    const transfers = await InventoryTransferModel.find({ destinationStoreId: req.params.storeId }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ transfers: await Promise.all(transfers.map(buildTransferDto)) });
  } catch (caught) {
    next(caught);
  }
});

managerWarehouseRouter.patch("/stores/:storeId/inventory-transfers/:transferId/receive", assertStoreAccess, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId);
    const transfer = await InventoryTransferModel.findOne({ _id: req.params.transferId, destinationStoreId: storeId });
    if (!transfer) throw error(404, "Transfer not found");
    if (transfer.status !== "dispatched" && transfer.status !== "partially_received") throw error(409, "Only dispatched transfers can be received.");
    const body = req.body as Record<string, unknown>;
    if (!Array.isArray(body.lines) || body.lines.length === 0) throw error(400, "Add at least one received line.");
    const prepared: Array<{ line: any; receivedQuantity: number; baseQuantity: number; discrepancyReason?: string }> = [];
    for (const rawLine of body.lines) {
      if (!rawLine || typeof rawLine !== "object") throw error(400, "Received line is invalid.");
      const lineBody = rawLine as Record<string, unknown>;
      const line = transfer.lines.id(String(lineBody.lineId));
      if (!line) throw error(404, "Transfer line not found");
      const receivedQuantity = requiredNumber(lineBody, "receivedQuantity", "Received quantity");
      const remaining = line.quantity - (line.receivedQuantity ?? 0);
      if (receivedQuantity < 0 || receivedQuantity > remaining) throw error(400, `Received quantity must be between 0 and ${remaining}.`);
      const discrepancyReason = typeof lineBody.discrepancyReason === "string" ? lineBody.discrepancyReason.trim() : "";
      if (receivedQuantity < remaining && !discrepancyReason) throw error(400, "A reason is required when received quantity is less than transferred quantity.");
      const item = await InventoryItemModel.findById(line.inventoryItemId).lean();
      if (!item) throw error(404, "Inventory item not found");
      prepared.push({ line, receivedQuantity, baseQuantity: quantityInBaseUnits(item, receivedQuantity, line.unit), discrepancyReason: discrepancyReason || undefined });
    }

    for (const entry of prepared) {
      if (entry.receivedQuantity > 0) {
        await changeStock({ itemId: String(entry.line.inventoryItemId), location: { type: "store", id: storeId }, delta: entry.baseQuantity, transactionType: "store_receiving", userId: req.auth!.sub, referenceNumber: transfer.transferNumber, sourceLabel: "Central Warehouse", destinationLabel: `Store ${storeId}`, relatedTransferId: String(transfer._id), notes: `Received ${entry.receivedQuantity} ${entry.line.unit}.` });
      }
      const remaining = entry.line.quantity - (entry.line.receivedQuantity ?? 0);
      if (entry.receivedQuantity < remaining) {
        const item = await InventoryItemModel.findById(entry.line.inventoryItemId).lean();
        await InventoryTransactionModel.create({ transactionNumber: transactionNumber("INV"), transactionType: "loss", inventoryItemId: entry.line.inventoryItemId, quantity: quantityInBaseUnits(item!, remaining - entry.receivedQuantity, entry.line.unit), unit: item!.baseUnit, locationType: "store", locationId: storeId, quantityBefore: 0, quantityAfter: 0, quantityDelta: 0, sourceLabel: "In transit", destinationLabel: "Store discrepancy", referenceNumber: transfer.transferNumber, reason: entry.discrepancyReason, relatedTransferId: transfer._id, performedByUserId: req.auth!.sub });
      }
      entry.line.set({ receivedQuantity: (entry.line.receivedQuantity ?? 0) + entry.receivedQuantity, discrepancyReason: entry.discrepancyReason });
    }

    const complete = transfer.lines.every((line) => (line.receivedQuantity ?? 0) >= line.quantity);
    const anyReceived = transfer.lines.some((line) => (line.receivedQuantity ?? 0) > 0);
    transfer.set({ status: complete ? "completed" : anyReceived ? "partially_received" : "partially_received", receivedByUserId: req.auth!.sub, receivedAt: new Date() });
    await transfer.save();
    res.json({ transfer: await buildTransferDto(transfer.toObject()) });
  } catch (caught) {
    next(caught);
  }
});

managerWarehouseRouter.get("/stores/:storeId/warehouse-returns", assertStoreAccess, async (req, res, next) => {
  try {
    const returns = await InventoryReturnModel.find({ storeId: req.params.storeId }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ returns: await Promise.all(returns.map(buildReturnDto)) });
  } catch (caught) {
    next(caught);
  }
});

managerWarehouseRouter.post("/stores/:storeId/warehouse-returns", assertStoreAccess, async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const inventoryItemId = requiredString(body, "inventoryItemId", "Product");
    const quantity = requiredNumber(body, "quantity", "Quantity");
    const reason = requiredString(body, "reason", "Reason");
    const unit = requiredString(body, "unit", "Unit");
    if (!Types.ObjectId.isValid(inventoryItemId) || quantity <= 0 || !INVENTORY_UNITS.includes(unit as (typeof INVENTORY_UNITS)[number])) throw error(400, "Product, quantity, and unit are invalid.");
    const item = await InventoryItemModel.findById(inventoryItemId).lean();
    if (!item) throw error(404, "Inventory item not found");
    const quantityInBase = quantityInBaseUnits(item, quantity, unit);
    const stock = await StoreStockModel.findOne({ storeId: req.params.storeId, inventoryItemId }).lean();
    if ((stock?.quantityOnHand ?? 0) < quantityInBase) throw error(409, `Insufficient store stock. Available: ${stock?.quantityOnHand ?? 0}. Requested: ${quantityInBase}.`);
    const returnRecord = await InventoryReturnModel.create({ returnNumber: transactionNumber("RET"), storeId: req.params.storeId, inventoryItemId, quantity, unit, reason, notes: typeof body.notes === "string" ? body.notes.trim() : undefined, createdByUserId: req.auth!.sub });
    res.status(201).json({ return: await buildReturnDto(returnRecord.toObject()) });
  } catch (caught) {
    next(caught);
  }
});
