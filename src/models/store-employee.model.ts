import { model, Schema, type InferSchemaType } from "mongoose";
import { STORE_EMPLOYEE_ROLES, STORE_EMPLOYEE_STATUSES } from "./model.constants.js";

const storeEmployeeSchema = new Schema(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    userAccountId: {
      type: Schema.Types.ObjectId,
      ref: "UserAccount",
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 120,
      required(this: { userAccountId?: unknown }) {
        return !this.userAccountId;
      },
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 160,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    role: {
      type: String,
      enum: STORE_EMPLOYEE_ROLES,
      default: "employee",
      required: true,
    },
    positionTitle: {
      type: String,
      trim: true,
      maxlength: 80,
      required(this: { role?: string }) {
        return this.role === "other";
      },
    },
    status: {
      type: String,
      enum: STORE_EMPLOYEE_STATUSES,
      default: "active",
      required: true,
    },
    employeeCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 32,
    },
    contactPhone: {
      type: String,
      trim: true,
      maxlength: 40,
    },
    hiredAt: {
      type: Date,
    },
    terminatedAt: {
      type: Date,
    },
  },
  {
    collection: "store_employees",
    timestamps: true,
  },
);

storeEmployeeSchema.index(
  { storeId: 1, userAccountId: 1 },
  {
    unique: true,
    partialFilterExpression: { userAccountId: { $type: "objectId" } },
  },
);
storeEmployeeSchema.index({ storeId: 1, role: 1, status: 1 });
storeEmployeeSchema.index(
  { storeId: 1, employeeCode: 1 },
  {
    unique: true,
    partialFilterExpression: { employeeCode: { $type: "string" } },
  },
);

export type StoreEmployee = InferSchemaType<typeof storeEmployeeSchema>;
export const StoreEmployeeModel = model("StoreEmployee", storeEmployeeSchema);
