import { model, Schema, type InferSchemaType } from "mongoose";
import { USER_ACCOUNT_ROLES, USER_ACCOUNT_STATUSES } from "./model.constants.js";

const userAccountSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 320,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    role: {
      type: String,
      enum: USER_ACCOUNT_ROLES,
      default: "employee",
      required: true,
    },
    status: {
      type: String,
      enum: USER_ACCOUNT_STATUSES,
      default: "invited",
      required: true,
    },
    passwordHash: {
      type: String,
      trim: true,
      maxlength: 256,
      select: false,
    },
    lastLoginAt: {
      type: Date,
    },
  },
  {
    collection: "user_accounts",
    timestamps: true,
  },
);

userAccountSchema.index({ email: 1 }, { unique: true });
userAccountSchema.index({ status: 1, role: 1 });

export type UserAccount = InferSchemaType<typeof userAccountSchema>;
export const UserAccountModel = model("UserAccount", userAccountSchema);
