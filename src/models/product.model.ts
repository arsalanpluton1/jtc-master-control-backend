import { model, Schema, type InferSchemaType } from "mongoose";
import { PRODUCT_STATUSES, PRODUCT_TYPES } from "./model.constants.js";

const productSchema = new Schema(
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
    type: {
      type: String,
      enum: PRODUCT_TYPES,
      default: "prepared_item",
      required: true,
    },
    status: {
      type: String,
      enum: PRODUCT_STATUSES,
      default: "draft",
      required: true,
    },
    recipeId: {
      type: Schema.Types.ObjectId,
      ref: "Recipe",
    },
    priceCents: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    collection: "products",
    timestamps: true,
  },
);

productSchema.index({ sku: 1 }, { unique: true });
productSchema.index({ status: 1, category: 1, name: 1 });
productSchema.index({ recipeId: 1 });

export type Product = InferSchemaType<typeof productSchema>;
export const ProductModel = model("Product", productSchema);
