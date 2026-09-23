import { model, Schema, type InferSchemaType } from "mongoose";
import { STORE_STATUSES } from "./model.constants.js";

const storeSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 24,
      match: /^[A-Z0-9_-]+$/,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 80,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    status: {
      type: String,
      enum: STORE_STATUSES,
      default: "active",
      required: true,
    },
    timezone: {
      type: String,
      required: true,
      trim: true,
      default: "UTC",
    },
    address: {
      line1: { type: String, trim: true, maxlength: 160 },
      line2: { type: String, trim: true, maxlength: 160 },
      city: { type: String, trim: true, maxlength: 80 },
      region: { type: String, trim: true, maxlength: 80 },
      postalCode: { type: String, trim: true, maxlength: 24 },
      country: { type: String, trim: true, maxlength: 80 },
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 40,
    },
  },
  {
    collection: "stores",
    timestamps: true,
  },
);

storeSchema.index({ code: 1 }, { unique: true });
storeSchema.index({ slug: 1 }, { unique: true });
storeSchema.index({ status: 1, name: 1 });

export type Store = InferSchemaType<typeof storeSchema>;
export const StoreModel = model("Store", storeSchema);
