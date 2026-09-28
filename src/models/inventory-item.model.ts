import { model, Schema, type InferSchemaType } from "mongoose";
import { INVENTORY_ITEM_STATUSES, INVENTORY_UNITS } from "./model.constants.js";

const inventoryPackagingLevelSchema = new Schema(
  {
    parentUnit: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-z][a-z0-9_-]{1,31}$/,
    },
    childUnit: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-z][a-z0-9_-]{1,31}$/,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator(value: number) {
          return Number.isInteger(value);
        },
        message: "Packaging quantity must be a positive whole number.",
      },
    },
  },
  { _id: false },
);

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
    subcategory: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    barcode: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    supplier: {
      type: String,
      trim: true,
      maxlength: 160,
    },
    purchaseUnit: {
      type: String,
      enum: INVENTORY_UNITS,
      required: true,
    },
    baseUnit: {
      type: String,
      enum: INVENTORY_UNITS,
      required: true,
    },
    packagingLevels: {
      type: [inventoryPackagingLevelSchema],
      default: [],
    },
    purchasePriceCents: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator(value: number) {
          return Number.isInteger(value);
        },
        message: "purchasePriceCents must be a whole number.",
      },
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
    imageUrl: {
      type: String,
      trim: true,
      maxlength: 320,
    },
    minimumStockLevel: {
      type: Number,
      min: 0,
      default: 0,
    },
    maximumStockLevel: {
      type: Number,
      min: 0,
    },
    notes: {
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
inventoryItemSchema.index({ barcode: 1 }, { unique: true, sparse: true });
inventoryItemSchema.index({ status: 1, category: 1, name: 1 });

export type InventoryItem = InferSchemaType<typeof inventoryItemSchema>;
export const InventoryItemModel = model("InventoryItem", inventoryItemSchema);
