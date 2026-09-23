import { model, Schema, type InferSchemaType } from "mongoose";
import { STATION_STATUSES } from "./model.constants.js";

const stationSchema = new Schema(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
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
      maxlength: 32,
      match: /^[A-Z0-9_-]+$/,
    },
    status: {
      type: String,
      enum: STATION_STATUSES,
      default: "active",
      required: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    collection: "stations",
    timestamps: true,
  },
);

stationSchema.index({ storeId: 1, code: 1 }, { unique: true });
stationSchema.index({ storeId: 1, status: 1, sortOrder: 1 });

export type Station = InferSchemaType<typeof stationSchema>;
export const StationModel = model("Station", stationSchema);
