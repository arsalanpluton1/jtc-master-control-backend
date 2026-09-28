import { model, Schema, type InferSchemaType } from "mongoose";
import { INVENTORY_RETURN_STATUSES, INVENTORY_UNITS } from "./model.constants.js";

const inventoryReturnSchema = new Schema(
  {
    returnNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true },
    inventoryItemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true },
    quantity: { type: Number, required: true, min: 0.000001 },
    unit: { type: String, enum: INVENTORY_UNITS, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 300 },
    status: { type: String, enum: INVENTORY_RETURN_STATUSES, default: "pending", required: true },
    notes: { type: String, trim: true, maxlength: 1000 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "UserAccount", required: true },
    receivedByUserId: { type: Schema.Types.ObjectId, ref: "UserAccount" },
    receivedAt: { type: Date },
  },
  { collection: "inventory_returns", timestamps: true },
);

inventoryReturnSchema.index({ storeId: 1, status: 1, createdAt: -1 });

export type InventoryReturn = InferSchemaType<typeof inventoryReturnSchema>;
export const InventoryReturnModel = model("InventoryReturn", inventoryReturnSchema);
