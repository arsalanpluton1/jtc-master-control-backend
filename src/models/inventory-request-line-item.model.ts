import { model, Schema, type InferSchemaType } from "mongoose";
import { INVENTORY_REQUEST_LINE_STATUSES } from "./model.constants.js";

const inventoryRequestLineItemSchema = new Schema(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    inventoryRequestId: {
      type: Schema.Types.ObjectId,
      ref: "InventoryRequest",
      required: true,
    },
    inventoryItemId: {
      type: Schema.Types.ObjectId,
      ref: "InventoryItem",
      required: true,
    },
    requestedQuantity: {
      type: Number,
      required: true,
      min: 0.000001,
    },
    approvedQuantity: {
      type: Number,
      min: 0,
      validate: {
        validator(this: { requestedQuantity?: number }, value?: number) {
          return value === undefined || this.requestedQuantity === undefined || value <= this.requestedQuantity;
        },
        message: "approvedQuantity cannot exceed requestedQuantity",
      },
    },
    fulfilledQuantity: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator(this: { approvedQuantity?: number; requestedQuantity?: number }, value?: number) {
          const limit = this.approvedQuantity ?? this.requestedQuantity;
          return value === undefined || limit === undefined || value <= limit;
        },
        message: "fulfilledQuantity cannot exceed approvedQuantity or requestedQuantity",
      },
    },
    status: {
      type: String,
      enum: INVENTORY_REQUEST_LINE_STATUSES,
      default: "pending",
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  {
    collection: "inventory_request_line_items",
    timestamps: true,
  },
);

inventoryRequestLineItemSchema.index({ inventoryRequestId: 1, inventoryItemId: 1 }, { unique: true });
inventoryRequestLineItemSchema.index({ storeId: 1, status: 1 });
inventoryRequestLineItemSchema.index({ inventoryItemId: 1 });

export type InventoryRequestLineItem = InferSchemaType<typeof inventoryRequestLineItemSchema>;
export const InventoryRequestLineItemModel = model("InventoryRequestLineItem", inventoryRequestLineItemSchema);
