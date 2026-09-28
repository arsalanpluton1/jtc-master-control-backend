import { model, Schema, type InferSchemaType } from "mongoose";
import { WAREHOUSE_TRANSACTION_TYPES } from "./model.constants.js";

const inventoryTransactionSchema = new Schema(
  {
    transactionNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    transactionType: { type: String, enum: WAREHOUSE_TRANSACTION_TYPES, required: true },
    inventoryItemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true, trim: true },
    locationType: { type: String, enum: ["warehouse", "store"], required: true },
    locationId: { type: Schema.Types.ObjectId },
    quantityBefore: { type: Number, required: true, min: 0 },
    quantityAfter: { type: Number, required: true, min: 0 },
    quantityDelta: { type: Number, required: true },
    sourceLabel: { type: String, trim: true, maxlength: 160 },
    destinationLabel: { type: String, trim: true, maxlength: 160 },
    referenceNumber: { type: String, trim: true, maxlength: 80 },
    supplier: { type: String, trim: true, maxlength: 160 },
    invoiceNumber: { type: String, trim: true, maxlength: 100 },
    batchNumber: { type: String, trim: true, maxlength: 100 },
    expiryDate: { type: Date },
    reason: { type: String, trim: true, maxlength: 300 },
    notes: { type: String, trim: true, maxlength: 1000 },
    relatedTransferId: { type: Schema.Types.ObjectId, ref: "InventoryTransfer" },
    relatedReturnId: { type: Schema.Types.ObjectId, ref: "InventoryReturn" },
    performedByUserId: { type: Schema.Types.ObjectId, ref: "UserAccount", required: true },
  },
  { collection: "inventory_transactions", timestamps: true },
);

inventoryTransactionSchema.index({ inventoryItemId: 1, createdAt: -1 });
inventoryTransactionSchema.index({ locationType: 1, locationId: 1, createdAt: -1 });
inventoryTransactionSchema.index({ transactionType: 1, createdAt: -1 });

export type InventoryTransaction = InferSchemaType<typeof inventoryTransactionSchema>;
export const InventoryTransactionModel = model("InventoryTransaction", inventoryTransactionSchema);
