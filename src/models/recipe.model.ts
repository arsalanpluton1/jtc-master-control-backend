import { model, Schema, type InferSchemaType } from "mongoose";
import { INVENTORY_UNITS, RECIPE_STATUSES } from "./model.constants.js";

const recipeIngredientSchema = new Schema(
  {
    inventoryItemId: {
      type: Schema.Types.ObjectId,
      ref: "InventoryItem",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.000001,
    },
    unit: {
      type: String,
      enum: INVENTORY_UNITS,
      required: true,
    },
    preparationNote: {
      type: String,
      trim: true,
      maxlength: 300,
    },
  },
  { _id: false },
);

const recipeSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 160,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 64,
      match: /^[A-Z0-9_.-]+$/,
    },
    status: {
      type: String,
      enum: RECIPE_STATUSES,
      default: "draft",
      required: true,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    yieldQuantity: {
      type: Number,
      required: true,
      default: 1,
      min: 0.000001,
    },
    yieldUnit: {
      type: String,
      enum: INVENTORY_UNITS,
      required: true,
      default: "each",
    },
    ingredients: {
      type: [recipeIngredientSchema],
      validate: {
        validator(value: unknown[]) {
          return value.length > 0;
        },
        message: "Recipe must include at least one ingredient",
      },
    },
  },
  {
    collection: "recipes",
    timestamps: true,
  },
);

recipeSchema.index({ code: 1, version: 1 }, { unique: true });
recipeSchema.index({ status: 1, name: 1 });
recipeSchema.index({ "ingredients.inventoryItemId": 1 });

export type Recipe = InferSchemaType<typeof recipeSchema>;
export const RecipeModel = model("Recipe", recipeSchema);
