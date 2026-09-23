import { model, Schema, type InferSchemaType } from "mongoose";
import { INVENTORY_ITEM_STATUSES, INVENTORY_UNITS } from "./model.constants.js";

const inventoryItemSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 160,
    },
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 64,
      match: /^[A-Z0-9_.-]+$/,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    baseUnit: {
      type: String,
      enum: INVENTORY_UNITS,
      required: true,
    },
    status: {
      type: String,
      enum: INVENTORY_ITEM_STATUSES,
      default: "active",
      required: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    collection: "inventory_items",
    timestamps: true,
  },
);

inventoryItemSchema.index({ sku: 1 }, { unique: true });
inventoryItemSchema.index({ status: 1, category: 1, name: 1 });

export type InventoryItem = InferSchemaType<typeof inventoryItemSchema>;
export const InventoryItemModel = model("InventoryItem", inventoryItemSchema);
