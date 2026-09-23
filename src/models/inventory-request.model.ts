import { model, Schema, type InferSchemaType } from "mongoose";
import { INVENTORY_REQUEST_STATUSES } from "./model.constants.js";

const inventoryRequestSchema = new Schema(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    requestNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 40,
    },
    status: {
      type: String,
      enum: INVENTORY_REQUEST_STATUSES,
      default: "draft",
      required: true,
    },
    requestedByEmployeeId: {
      type: Schema.Types.ObjectId,
      ref: "StoreEmployee",
      required: true,
    },
    stationId: {
      type: Schema.Types.ObjectId,
      ref: "Station",
    },
    submittedAt: {
      type: Date,
    },
    resolvedByEmployeeId: {
      type: Schema.Types.ObjectId,
      ref: "StoreEmployee",
    },
    resolvedAt: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    collection: "inventory_requests",
    timestamps: true,
  },
);

inventoryRequestSchema.index({ storeId: 1, requestNumber: 1 }, { unique: true });
inventoryRequestSchema.index({ storeId: 1, status: 1, createdAt: -1 });
inventoryRequestSchema.index({ requestedByEmployeeId: 1, createdAt: -1 });
inventoryRequestSchema.index({ stationId: 1, status: 1 });

export type InventoryRequest = InferSchemaType<typeof inventoryRequestSchema>;
export const InventoryRequestModel = model("InventoryRequest", inventoryRequestSchema);
