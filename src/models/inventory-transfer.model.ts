import { model, Schema, type InferSchemaType } from "mongoose";
import { INVENTORY_UNITS, WAREHOUSE_TRANSFER_STATUSES } from "./model.constants.js";

const inventoryTransferLineSchema = new Schema(
  {
    inventoryItemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true },
    quantity: { type: Number, required: true, min: 0.000001 },
    unit: { type: String, enum: INVENTORY_UNITS, required: true },
    receivedQuantity: { type: Number, default: 0, min: 0 },
    discrepancyReason: { type: String, trim: true, maxlength: 300 },
  },
  { _id: true },
);

const inventoryTransferSchema = new Schema(
  {
    transferNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    destinationStoreId: { type: Schema.Types.ObjectId, ref: "Store", required: true },
    status: { type: String, enum: WAREHOUSE_TRANSFER_STATUSES, required: true, default: "pending_approval" },
    lines: { type: [inventoryTransferLineSchema], validate: (value: unknown[]) => value.length > 0 },
    requestedByUserId: { type: Schema.Types.ObjectId, ref: "UserAccount", required: true },
    approvedByUserId: { type: Schema.Types.ObjectId, ref: "UserAccount" },
    dispatchedByUserId: { type: Schema.Types.ObjectId, ref: "UserAccount" },
    receivedByUserId: { type: Schema.Types.ObjectId, ref: "UserAccount" },
    requestedAt: { type: Date, default: Date.now },
    approvedAt: { type: Date },
    dispatchedAt: { type: Date },
    receivedAt: { type: Date },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { collection: "inventory_transfers", timestamps: true },
);

inventoryTransferSchema.index({ destinationStoreId: 1, status: 1, createdAt: -1 });
inventoryTransferSchema.index({ status: 1, createdAt: -1 });

export type InventoryTransfer = InferSchemaType<typeof inventoryTransferSchema>;
export const InventoryTransferModel = model("InventoryTransfer", inventoryTransferSchema);
