import { model, Schema, type InferSchemaType } from "mongoose";
import { STOCK_STATUSES } from "./model.constants.js";

const storeStockSchema = new Schema(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    inventoryItemId: {
      type: Schema.Types.ObjectId,
      ref: "InventoryItem",
      required: true,
    },
    quantityOnHand: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    reorderPoint: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    parLevel: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: STOCK_STATUSES,
      default: "in_stock",
      required: true,
    },
    lastCountedAt: {
      type: Date,
    },
    lastRequestedAt: {
      type: Date,
    },
  },
  {
    collection: "store_stock",
    timestamps: true,
  },
);

storeStockSchema.index({ storeId: 1, inventoryItemId: 1 }, { unique: true });
storeStockSchema.index({ storeId: 1, status: 1 });
storeStockSchema.index({ inventoryItemId: 1 });

export type StoreStock = InferSchemaType<typeof storeStockSchema>;
export const StoreStockModel = model("StoreStock", storeStockSchema);
