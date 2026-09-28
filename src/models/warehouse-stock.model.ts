import { model, Schema, type InferSchemaType } from "mongoose";
import { STOCK_STATUSES, WAREHOUSE_CODE } from "./model.constants.js";

const warehouseStockSchema = new Schema(
  {
    warehouseCode: {
      type: String,
      required: true,
      default: WAREHOUSE_CODE,
      enum: [WAREHOUSE_CODE],
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
    reorderPoint: { type: Number, default: 0, min: 0 },
    parLevel: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: STOCK_STATUSES,
      default: "in_stock",
      required: true,
    },
    lastCountedAt: { type: Date },
  },
  { collection: "warehouse_stock", timestamps: true },
);

warehouseStockSchema.index({ warehouseCode: 1, inventoryItemId: 1 }, { unique: true });
warehouseStockSchema.index({ warehouseCode: 1, status: 1 });

export type WarehouseStock = InferSchemaType<typeof warehouseStockSchema>;
export const WarehouseStockModel = model("WarehouseStock", warehouseStockSchema);
