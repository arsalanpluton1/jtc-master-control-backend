export const STORE_STATUSES = ["active", "inactive", "closed"] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

export const USER_ACCOUNT_STATUSES = ["invited", "active", "suspended", "disabled"] as const;
export type UserAccountStatus = (typeof USER_ACCOUNT_STATUSES)[number];

export const USER_ACCOUNT_ROLES = ["admin", "manager", "employee"] as const;
export type UserAccountRole = (typeof USER_ACCOUNT_ROLES)[number];

export const STORE_EMPLOYEE_ROLES = ["manager", "employee"] as const;
export type StoreEmployeeRole = (typeof STORE_EMPLOYEE_ROLES)[number];

export const STORE_EMPLOYEE_STATUSES = ["active", "inactive", "terminated"] as const;
export type StoreEmployeeStatus = (typeof STORE_EMPLOYEE_STATUSES)[number];

export const STATION_STATUSES = ["active", "inactive", "maintenance"] as const;
export type StationStatus = (typeof STATION_STATUSES)[number];

export const INVENTORY_ITEM_STATUSES = ["active", "inactive", "discontinued"] as const;
export type InventoryItemStatus = (typeof INVENTORY_ITEM_STATUSES)[number];

export const STOCK_STATUSES = ["in_stock", "low_stock", "out_of_stock", "inactive"] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const INVENTORY_REQUEST_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "partially_fulfilled",
  "fulfilled",
  "rejected",
  "cancelled",
] as const;
export type InventoryRequestStatus = (typeof INVENTORY_REQUEST_STATUSES)[number];

export const INVENTORY_REQUEST_LINE_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "partially_fulfilled",
  "fulfilled",
  "cancelled",
] as const;
export type InventoryRequestLineStatus = (typeof INVENTORY_REQUEST_LINE_STATUSES)[number];

export const RECIPE_STATUSES = ["draft", "active", "inactive", "archived"] as const;
export type RecipeStatus = (typeof RECIPE_STATUSES)[number];

export const PRODUCT_STATUSES = ["draft", "active", "inactive", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_TYPES = ["prepared_item", "retail_item", "modifier", "bundle"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const INVENTORY_UNITS = ["each", "gram", "kilogram", "milliliter", "liter", "ounce", "pound", "case"] as const;
export type InventoryUnit = (typeof INVENTORY_UNITS)[number];
