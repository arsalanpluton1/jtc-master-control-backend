import { Router, type RequestHandler } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { Types } from "mongoose";
import {
  InventoryItemModel,
  InventoryRequestLineItemModel,
  InventoryRequestModel,
  ProductModel,
  RecipeModel,
  StationModel,
  StoreEmployeeModel,
  StoreStockModel,
  StoreModel,
  UserAccountModel,
} from "../../models/index.js";
import {
  INVENTORY_ITEM_STATUSES,
  INVENTORY_REQUEST_LINE_STATUSES,
  INVENTORY_REQUEST_STATUSES,
  INVENTORY_UNITS,
  STOCK_STATUSES,
  STATION_STATUSES,
  STORE_EMPLOYEE_ROLES,
  STORE_EMPLOYEE_STATUSES,
  STORE_STATUSES,
  STORE_TYPES,
  PRODUCT_STATUSES,
  PRODUCT_TYPES,
  RECIPE_STATUSES,
  USER_ACCOUNT_STATUSES,
} from "../../models/model.constants.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { generateTemporaryPassword, hashPassword } from "../auth/password.service.js";
import { calculateSmallestUnitCostCents } from "./inventory-cost.js";
import { calculateProductCostCents, calculateProductMargin } from "./product-cost.js";
import { calculateRecipeCost } from "./recipe-cost.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("admin"));

const uploadsRoot = path.resolve(process.cwd(), "uploads");
const storeCoverUploadsRoot = path.join(uploadsRoot, "stores");

const storeCoverUpload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, callback) => {
      try {
        await fs.mkdir(storeCoverUploadsRoot, { recursive: true });
        callback(null, storeCoverUploadsRoot);
      } catch (error) {
        callback(error as Error, storeCoverUploadsRoot);
      }
    },
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;

      callback(null, filename);
    },
  }),
  fileFilter: (_req, file, callback) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      callback(new Error("Cover photo must be a JPEG, PNG, or WebP image."));
      return;
    }

    callback(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});

const handleStoreCoverUpload: RequestHandler = (req, res, next) => {
  storeCoverUpload.single("coverPhoto")(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    const message =
      error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
        ? "Cover photo must be 5 MB or smaller."
        : error instanceof Error
          ? error.message
          : "Cover photo upload failed.";

    next(Object.assign(new Error(message), { statusCode: 400 }));
  });
};

function requiredString(body: Record<string, unknown>, key: string, label: string) {
  const value = typeof body[key] === "string" ? body[key].trim() : "";

  if (!value) {
    throwValidationError(`${label} is required.`);
  }

  return value;
}

function optionalString(body: Record<string, unknown>, key: string) {
  const value = typeof body[key] === "string" ? body[key].trim() : "";

  return value || undefined;
}

function requiredBoolean(body: Record<string, unknown>, key: string, label: string) {
  const value = body[key];

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }

    if (value === "false") {
      return false;
    }
  }

  throwValidationError(`${label} is required.`);
}

function optionalDate(body: Record<string, unknown>, key: string, label: string) {
  const value = optionalString(body, key);

  if (!value) {
    return undefined;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throwValidationError(`${label} must be a valid date.`);
  }

  return date;
}

function throwValidationError(message: string): never {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 400;
  throw error;
}

function slugifyStore(name: string, storeNumber: string) {
  const slug = `${name}-${storeNumber}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || storeNumber.toLowerCase();
}

async function removeUploadedFile(file?: Express.Multer.File) {
  if (!file) {
    return;
  }

  await fs.unlink(file.path).catch(() => undefined);
}

function toAdminStoreDto(store: {
  _id: unknown;
  name: string;
  code: string;
  slug: string;
  storeType?: string;
  status: string;
  isActive?: boolean;
  timezone: string;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    region?: string | null;
    postalCode?: string | null;
    country?: string | null;
  } | null;
  phone?: string | null;
  email?: string | null;
  manager?: string | null;
  expectedOpenDate?: Date | null;
  coverPhoto?: {
    url?: string | null;
    path?: string | null;
    originalName?: string | null;
    mimeType?: string | null;
    size?: number | null;
  } | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    _id: String(store._id),
    name: store.name,
    storeNumber: store.code,
    slug: store.slug,
    storeType: store.storeType ?? "standard",
    status: store.status,
    isActive: store.isActive ?? true,
    timezone: store.timezone,
    address: store.address,
    phone: store.phone,
    email: store.email,
    manager: store.manager,
    expectedOpenDate: store.expectedOpenDate,
    coverPhoto: store.coverPhoto,
    createdAt: store.createdAt,
    updatedAt: store.updatedAt,
  };
}

function toAdminStationDto(
  station: {
    _id: unknown;
    storeId: unknown;
    name: string;
    code: string;
    status: string;
    sortOrder: number;
    createdAt?: Date;
    updatedAt?: Date;
  },
  store?: {
    _id: unknown;
    name: string;
    code: string;
    slug: string;
    status?: string;
  } | null,
) {
  return {
    _id: String(station._id),
    storeId: String(station.storeId),
    name: station.name,
    code: station.code,
    status: station.status,
    sortOrder: station.sortOrder,
    store: store
      ? {
          _id: String(store._id),
          name: store.name,
          storeNumber: store.code,
          slug: store.slug,
          status: store.status,
        }
      : null,
    createdAt: station.createdAt,
    updatedAt: station.updatedAt,
  };
}

function toCoverPhoto(file: Express.Multer.File) {
  return {
    url: `/uploads/stores/${file.filename}`,
    path: `uploads/stores/${file.filename}`,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
  };
}

type EmployeeStoreSummary = {
  _id: unknown;
  name: string;
  code: string;
  slug: string;
};

type EmployeeUserSummary = {
  _id: unknown;
  displayName: string;
  email: string;
  role: string;
  status: string;
} | null;

function toStoreEmployeeDto(
  employee: {
    _id: unknown;
    storeId: unknown;
    displayName?: string | null;
    email?: string | null;
    role: string;
    positionTitle?: string | null;
    status: string;
    employeeCode?: string | null;
    contactPhone?: string | null;
    hiredAt?: Date | null;
    terminatedAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
  },
  store: EmployeeStoreSummary,
  user: EmployeeUserSummary = null,
) {
  return {
    _id: String(employee._id),
    storeId: String(employee.storeId),
    displayName: employee.displayName,
    email: employee.email,
    role: employee.role,
    positionTitle: employee.positionTitle,
    status: employee.status,
    employeeCode: employee.employeeCode,
    contactPhone: employee.contactPhone,
    hiredAt: employee.hiredAt,
    terminatedAt: employee.terminatedAt,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
    store: {
      _id: String(store._id),
      name: store.name,
      storeNumber: store.code,
      slug: store.slug,
    },
    user: user
      ? {
          _id: String(user._id),
          displayName: user.displayName,
          email: user.email,
          role: user.role,
          status: user.status,
        }
      : null,
  };
}

async function buildStoreEmployeeDtos(store: EmployeeStoreSummary) {
  const employees = await StoreEmployeeModel.find({ storeId: store._id })
    .sort({ role: 1, employeeCode: 1, displayName: 1, createdAt: 1 })
    .lean();
  const userIds = employees.map((employee) => employee.userAccountId).filter(Boolean);
  const users = await UserAccountModel.find({ _id: { $in: userIds } })
    .select("displayName email role status")
    .lean();
  const usersById = new Map(users.map((user) => [String(user._id), user]));

  return employees.map((employee) => toStoreEmployeeDto(employee, store, usersById.get(String(employee.userAccountId)) ?? null));
}

function parseStorePayload(body: Record<string, unknown>) {
  const name = requiredString(body, "name", "Store name");
  const storeNumber = requiredString(body, "storeNumber", "Store number").toUpperCase();
  const status = requiredString(body, "status", "Store status");
  const storeType = requiredString(body, "storeType", "Store type");
  const isActive = requiredBoolean(body, "isActive", "Active state");
  const email = optionalString(body, "email");

  if (!STORE_STATUSES.includes(status as (typeof STORE_STATUSES)[number])) {
    throwValidationError("Store status is not supported.");
  }

  if (!STORE_TYPES.includes(storeType as (typeof STORE_TYPES)[number])) {
    throwValidationError("Store type is not supported.");
  }

  if (!/^[A-Z0-9_-]+$/.test(storeNumber)) {
    throwValidationError("Store number may only contain letters, numbers, underscores, and hyphens.");
  }

  if (storeNumber.length < 2 || storeNumber.length > 24) {
    throwValidationError("Store number must be between 2 and 24 characters long.");
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throwValidationError("Email must be a valid email address.");
  }

  return {
    name,
    code: storeNumber,
    slug: slugifyStore(name, storeNumber),
    storeType,
    status,
    isActive,
    timezone: "UTC",
    address: {
      line1: optionalString(body, "street"),
      city: optionalString(body, "city"),
      region: optionalString(body, "state"),
      country: optionalString(body, "country"),
      postalCode: optionalString(body, "postalCode"),
    },
    expectedOpenDate: optionalDate(body, "expectedOpenDate", "Expected open date"),
    manager: optionalString(body, "manager"),
    phone: optionalString(body, "phone"),
    email,
  };
}

function parseStationPayload(body: Record<string, unknown>) {
  const name = requiredString(body, "name", "Station name");
  const storeId = requiredString(body, "storeId", "Store");
  const code = requiredString(body, "code", "Station code").toUpperCase();
  const status = optionalString(body, "status") ?? "active";
  const sortOrderInput = body.sortOrder;
  const sortOrder =
    sortOrderInput === undefined || sortOrderInput === ""
      ? 0
      : typeof sortOrderInput === "number"
        ? sortOrderInput
        : typeof sortOrderInput === "string"
          ? Number(sortOrderInput)
          : Number.NaN;

  if (name.length < 2 || name.length > 120) {
    throwValidationError("Station name must be between 2 and 120 characters long.");
  }

  if (!Types.ObjectId.isValid(storeId)) {
    throwValidationError("Store is not valid.");
  }

  if (!/^[A-Z0-9_-]+$/.test(code)) {
    throwValidationError("Station code may only contain letters, numbers, underscores, and hyphens.");
  }

  if (code.length < 2 || code.length > 32) {
    throwValidationError("Station code must be between 2 and 32 characters long.");
  }

  if (!STATION_STATUSES.includes(status as (typeof STATION_STATUSES)[number])) {
    throwValidationError("Station status is not supported.");
  }

  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    throwValidationError("Sort order must be a whole number greater than or equal to 0.");
  }

  return {
    name,
    storeId,
    code,
    status,
    sortOrder,
  };
}

function parseManagerPayload(body: Record<string, unknown>, storeId: string) {
  const displayName = requiredString(body, "displayName", "Manager name");
  const email = requiredString(body, "email", "Email").toLowerCase();
  const role = requiredString(body, "role", "Role");
  const accountStatus = requiredString(body, "accountStatus", "Account status");
  const assignmentStatus = optionalString(body, "assignmentStatus") ?? "active";
  const contactPhone = optionalString(body, "contactPhone");
  const employeeCode = optionalString(body, "employeeCode")?.toUpperCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throwValidationError("Email must be a valid email address.");
  }

  if (role !== "manager") {
    throwValidationError("Store Manager assignments must use the manager role.");
  }

  if (!USER_ACCOUNT_STATUSES.includes(accountStatus as (typeof USER_ACCOUNT_STATUSES)[number])) {
    throwValidationError("Account status is not supported.");
  }

  if (!STORE_EMPLOYEE_STATUSES.includes(assignmentStatus as (typeof STORE_EMPLOYEE_STATUSES)[number])) {
    throwValidationError("Assignment status is not supported.");
  }

  if (employeeCode && !/^[A-Z0-9_-]+$/.test(employeeCode)) {
    throwValidationError("Employee code may only contain letters, numbers, underscores, and hyphens.");
  }

  return {
    storeId,
    account: {
      email,
      displayName,
      role,
      status: accountStatus,
    },
    assignment: {
      role,
      status: assignmentStatus,
      employeeCode,
      contactPhone,
    },
  };
}

function parseEmployeePayload(body: Record<string, unknown>, storeId: string) {
  const displayName = requiredString(body, "displayName", "Employee name");
  const role = requiredString(body, "role", "Role or position");
  const status = optionalString(body, "status") ?? "active";
  const email = optionalString(body, "email")?.toLowerCase();
  const contactPhone = optionalString(body, "contactPhone");
  const employeeCode = optionalString(body, "employeeCode")?.toUpperCase();
  const positionTitle = optionalString(body, "positionTitle");
  const hiredAt = optionalDate(body, "hiredAt", "Hire date");

  if (!STORE_EMPLOYEE_ROLES.includes(role as (typeof STORE_EMPLOYEE_ROLES)[number]) || role === "manager") {
    throwValidationError("Employee role is not supported.");
  }

  if (!STORE_EMPLOYEE_STATUSES.includes(status as (typeof STORE_EMPLOYEE_STATUSES)[number])) {
    throwValidationError("Employee status is not supported.");
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throwValidationError("Email must be a valid email address.");
  }

  if (employeeCode && !/^[A-Z0-9_-]+$/.test(employeeCode)) {
    throwValidationError("Employee code may only contain letters, numbers, underscores, and hyphens.");
  }

  if (role === "other" && !positionTitle) {
    throwValidationError("Position title is required when role is Other.");
  }

  return {
    storeId,
    displayName,
    email,
    role,
    positionTitle,
    status,
    employeeCode,
    contactPhone,
    hiredAt,
  };
}

async function buildAdminStoreDetail(store: Parameters<typeof toAdminStoreDto>[0]) {
  const storeId = String(store._id);
  const [employees, stations] = await Promise.all([
    StoreEmployeeModel.find({ storeId }).sort({ role: 1, employeeCode: 1, createdAt: 1 }).lean(),
    StationModel.find({ storeId }).sort({ sortOrder: 1, name: 1 }).select("name code status sortOrder").lean(),
  ]);
  const userIds = employees.map((employee) => employee.userAccountId).filter(Boolean);
  const users = await UserAccountModel.find({ _id: { $in: userIds } })
    .select("displayName email role status")
    .lean();
  const usersById = new Map(users.map((user) => [String(user._id), user]));
  const employeeDtos = employees.map((employee) =>
    toStoreEmployeeDto(employee, store, usersById.get(String(employee.userAccountId)) ?? null),
  );

  return {
    store: toAdminStoreDto(store),
    manager: employeeDtos.find((employee) => employee.role === "manager") ?? null,
    employees: employeeDtos.filter((employee) => employee.role !== "manager"),
    stations: stations.map((station) => ({
      _id: String(station._id),
      name: station.name,
      code: station.code,
      status: station.status,
      sortOrder: station.sortOrder,
    })),
  };
}

type AdminInventoryItemRecord = {
  _id: unknown;
  name: string;
  sku: string;
  category: string;
  purchaseUnit?: string;
  baseUnit: string;
  packagingLevels?: Array<{
    parentUnit: string;
    childUnit: string;
    quantity: number;
  }>;
  status: string;
  purchasePriceCents?: number;
  description?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type AdminInventoryStockRecord = {
  _id: unknown;
  storeId: unknown;
  quantityOnHand: number;
  reorderPoint: number;
  parLevel: number;
  status: string;
  lastCountedAt?: Date | null;
  lastRequestedAt?: Date | null;
};

type AdminInventoryStoreRecord = {
  _id: unknown;
  name: string;
  code: string;
  slug: string;
  status: string;
};

function toAdminInventoryDto(
  item: AdminInventoryItemRecord,
  stocks: AdminInventoryStockRecord[],
  storesById: Map<string, AdminInventoryStoreRecord>,
) {
  return {
    _id: String(item._id),
    name: item.name,
    sku: item.sku,
    category: item.category,
    purchaseUnit: item.purchaseUnit,
    baseUnit: item.baseUnit,
    packagingLevels: item.packagingLevels ?? [],
    status: item.status,
    description: item.description,
    purchasePriceCents: item.purchasePriceCents,
    smallestUnitCostCents: calculateSmallestUnitCostCents(item),
    stores: stocks.map((stock) => {
      const store = storesById.get(String(stock.storeId));

      return {
        _id: String(stock._id),
        store: store
          ? {
              _id: String(store._id),
              name: store.name,
              storeNumber: store.code,
              slug: store.slug,
              status: store.status,
            }
          : null,
        quantityOnHand: stock.quantityOnHand,
        reorderPoint: stock.reorderPoint,
        parLevel: stock.parLevel,
        status: stock.status,
        lastCountedAt: stock.lastCountedAt,
        lastRequestedAt: stock.lastRequestedAt,
      };
    }),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function requiredNumber(body: Record<string, unknown>, key: string, label: string) {
  const value = body[key];
  const numberValue =
    typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;

  if (!Number.isFinite(numberValue)) {
    throwValidationError(`${label} is required and must be a number.`);
  }

  return numberValue;
}

function parsePackagingLevels(
  value: unknown,
  purchaseUnit: string,
  baseUnit: string,
) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length > 8) {
    throwValidationError("Packaging levels must be an array with no more than 8 levels.");
  }

  const levels = value.map((rawLevel, index) => {
    if (!rawLevel || typeof rawLevel !== "object" || Array.isArray(rawLevel)) {
      throwValidationError(`Packaging level ${index + 1} is invalid.`);
    }

    const level = rawLevel as Record<string, unknown>;
    const parentUnit = requiredString(level, "parentUnit", `Packaging level ${index + 1} parent unit`).toLowerCase();
    const childUnit = requiredString(level, "childUnit", `Packaging level ${index + 1} child unit`).toLowerCase();
    const quantity = requiredNumber(level, "quantity", `Packaging level ${index + 1} quantity`);

    if (!/^[a-z][a-z0-9_-]{1,31}$/.test(parentUnit) || !/^[a-z][a-z0-9_-]{1,31}$/.test(childUnit)) {
      throwValidationError(`Packaging level ${index + 1} units must use 2 to 32 lowercase letters, numbers, hyphens, or underscores.`);
    }

    if (parentUnit === childUnit) {
      throwValidationError(`Packaging level ${index + 1} must convert between different units.`);
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      throwValidationError(`Packaging level ${index + 1} quantity must be a positive whole number.`);
    }

    return { parentUnit, childUnit, quantity };
  });

  const byParent = new Map<string, (typeof levels)[number]>();

  for (const level of levels) {
    if (byParent.has(level.parentUnit)) {
      throwValidationError(`Packaging unit ${level.parentUnit} may only have one child conversion.`);
    }

    byParent.set(level.parentUnit, level);
  }

  if (levels.length === 0) {
    if (purchaseUnit !== baseUnit) {
      throwValidationError("Add packaging levels to connect the purchase unit to the smallest usable unit.");
    }

    return levels;
  }

  const visited = new Set<string>();
  let currentUnit = purchaseUnit;

  while (currentUnit !== baseUnit) {
    if (visited.has(currentUnit)) {
      throwValidationError("Packaging levels may not contain a conversion cycle.");
    }

    visited.add(currentUnit);
    const level = byParent.get(currentUnit);

    if (!level) {
      throwValidationError("Packaging levels must form a continuous chain from the purchase unit to the smallest usable unit.");
    }

    currentUnit = level.childUnit;
  }

  if (visited.size !== levels.length) {
    throwValidationError("Packaging levels may not contain disconnected conversions.");
  }

  return levels;
}

function parseInventoryPayload(body: Record<string, unknown>) {
  const name = requiredString(body, "name", "Inventory name");
  const sku = requiredString(body, "sku", "SKU").toUpperCase();
  const category = requiredString(body, "category", "Category");
  const purchaseUnit = requiredString(body, "purchaseUnit", "Purchase unit");
  const baseUnit = requiredString(body, "baseUnit", "Smallest usable unit");
  const status = optionalString(body, "status") ?? "active";
  const storeId = requiredString(body, "storeId", "Store");
  const purchasePriceCents = requiredNumber(body, "purchasePriceCents", "Purchase price");
  const initialStockQuantity = requiredNumber(body, "initialStockQuantity", "Initial stock quantity");

  if (name.length < 2 || name.length > 160) {
    throwValidationError("Inventory name must be between 2 and 160 characters long.");
  }

  if (!/^[A-Z0-9_.-]+$/.test(sku) || sku.length < 2 || sku.length > 64) {
    throwValidationError("SKU may only contain letters, numbers, underscores, periods, and hyphens, and must be 2 to 64 characters long.");
  }

  if (!INVENTORY_UNITS.includes(purchaseUnit as (typeof INVENTORY_UNITS)[number])) {
    throwValidationError("Purchase unit is not supported.");
  }

  if (!INVENTORY_UNITS.includes(baseUnit as (typeof INVENTORY_UNITS)[number])) {
    throwValidationError("Smallest usable unit is not supported.");
  }

  const packagingLevels = parsePackagingLevels(body.packagingLevels, purchaseUnit, baseUnit);

  if (!INVENTORY_ITEM_STATUSES.includes(status as (typeof INVENTORY_ITEM_STATUSES)[number])) {
    throwValidationError("Inventory status is not supported.");
  }

  if (!Types.ObjectId.isValid(storeId)) {
    throwValidationError("Store is not valid.");
  }

  if (!Number.isInteger(purchasePriceCents) || purchasePriceCents < 0) {
    throwValidationError("Purchase price must be a whole number of cents greater than or equal to 0.");
  }

  if (initialStockQuantity < 0) {
    throwValidationError("Initial stock quantity must be greater than or equal to 0.");
  }

  return {
    item: {
      name,
      sku,
      category,
      purchaseUnit,
      baseUnit,
      packagingLevels,
      status,
      purchasePriceCents,
      description: optionalString(body, "description"),
    },
    stock: {
      storeId,
      quantityOnHand: initialStockQuantity,
    },
  };
}

function parseInventoryItemUpdatePayload(body: Record<string, unknown>) {
  const name = requiredString(body, "name", "Inventory name");
  const sku = requiredString(body, "sku", "SKU").toUpperCase();
  const category = requiredString(body, "category", "Category");
  const purchaseUnit = requiredString(body, "purchaseUnit", "Purchase unit");
  const baseUnit = requiredString(body, "baseUnit", "Smallest usable unit");
  const status = optionalString(body, "status") ?? "active";
  const purchasePriceCents = requiredNumber(body, "purchasePriceCents", "Purchase price");

  if (name.length < 2 || name.length > 160) {
    throwValidationError("Inventory name must be between 2 and 160 characters long.");
  }

  if (!/^[A-Z0-9_.-]+$/.test(sku) || sku.length < 2 || sku.length > 64) {
    throwValidationError("SKU may only contain letters, numbers, underscores, periods, and hyphens, and must be 2 to 64 characters long.");
  }

  if (!INVENTORY_UNITS.includes(purchaseUnit as (typeof INVENTORY_UNITS)[number])) {
    throwValidationError("Purchase unit is not supported.");
  }

  if (!INVENTORY_UNITS.includes(baseUnit as (typeof INVENTORY_UNITS)[number])) {
    throwValidationError("Smallest usable unit is not supported.");
  }

  const packagingLevels = parsePackagingLevels(body.packagingLevels, purchaseUnit, baseUnit);

  if (!INVENTORY_ITEM_STATUSES.includes(status as (typeof INVENTORY_ITEM_STATUSES)[number])) {
    throwValidationError("Inventory status is not supported.");
  }

  if (!Number.isInteger(purchasePriceCents) || purchasePriceCents < 0) {
    throwValidationError("Purchase price must be a whole number of cents greater than or equal to 0.");
  }

  return {
    name,
    sku,
    category,
    purchaseUnit,
    baseUnit,
    packagingLevels,
    status,
    purchasePriceCents,
  };
}

type AdminProductRecord = {
  _id: unknown;
  name: string;
  sku: string;
  type: string;
  status: string;
  recipeId?: unknown | null;
  priceCents: number;
  laborCostCents: number;
  otherCostCents: number;
  category: string;
  description?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type AdminRecipeRecord = {
  _id: unknown;
  name: string;
  code: string;
  status: string;
  version: number;
  yieldQuantity: number;
  yieldUnit: string;
  ingredients: Array<{
    inventoryItemId: unknown;
    quantity: number;
    unit: string;
    preparationNote?: string | null;
  }>;
  createdAt?: Date;
  updatedAt?: Date;
};

type AdminRecipeInventorySummary = {
  _id: unknown;
  name: string;
  sku: string;
  category: string;
  baseUnit: string;
  purchaseUnit: string;
  purchasePriceCents: number;
  packagingLevels: Array<{
    parentUnit: string;
    childUnit: string;
    quantity: number;
  }>;
};

type AdminRecipeSummary = {
  _id: unknown;
  name: string;
  code: string;
  status: string;
  costPerYieldCents: number | null;
  costStatus: "calculated" | "incomplete";
};

function toAdminProductDto(product: AdminProductRecord, recipe?: AdminRecipeSummary | null) {
  const laborCostCents = product.laborCostCents ?? 0;
  const otherCostCents = product.otherCostCents ?? 0;
  const ingredientCostCents = recipe?.costPerYieldCents ?? null;
  const productCostCents = recipe
    ? calculateProductCostCents({
        ingredientCostCents,
        laborCostCents,
        otherCostCents,
      })
    : null;

  return {
    _id: String(product._id),
    name: product.name,
    sku: product.sku,
    type: product.type,
    status: product.status,
    recipeId: product.recipeId ? String(product.recipeId) : null,
    recipe: recipe
      ? {
          _id: String(recipe._id),
          name: recipe.name,
          code: recipe.code,
          status: recipe.status,
          costPerYieldCents: recipe.costPerYieldCents,
          costStatus: recipe.costStatus,
        }
      : null,
    priceCents: product.priceCents,
    laborCostCents,
    otherCostCents,
    ingredientCostCents,
    productCostCents,
    costStatus: recipe ? recipe.costStatus : "missing_recipe",
    category: product.category,
    description: product.description,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function toAdminProductCostDto(product: ReturnType<typeof toAdminProductDto>) {
  const margin = calculateProductMargin(product.priceCents, product.productCostCents);

  return {
    productId: product._id,
    name: product.name,
    sku: product.sku,
    sellingPriceCents: product.priceCents,
    ingredientCostCents: product.ingredientCostCents,
    laborCostCents: product.laborCostCents,
    otherCostCents: product.otherCostCents,
    productCostCents: product.productCostCents,
    grossMarginCents: margin.grossMarginCents,
    grossMarginPercent: margin.grossMarginPercent,
    costStatus: product.costStatus,
    recipe: product.recipe,
  };
}

async function buildAdminProductDtos(products: AdminProductRecord[]) {
  const recipeIds = [...new Set(products.filter((product) => product.recipeId).map((product) => String(product.recipeId)))];
  const recipes = recipeIds.length > 0
    ? await RecipeModel.find({ _id: { $in: recipeIds } }).select("name code status version yieldQuantity yieldUnit ingredients").lean()
    : [];
  const recipeDtos = await buildAdminRecipeDtos(recipes);
  const recipesById = new Map(recipeDtos.map((recipe) => [String(recipe._id), recipe]));

  return products.map((product) => toAdminProductDto(product, product.recipeId ? recipesById.get(String(product.recipeId)) ?? null : null));
}

function toAdminRecipeDto(recipe: AdminRecipeRecord, inventoryById: Map<string, AdminRecipeInventorySummary>) {
  const recipeCost = calculateRecipeCost(
    recipe.ingredients.map((ingredient) => ({
      inventoryItemId: String(ingredient.inventoryItemId),
      quantity: ingredient.quantity,
      unit: ingredient.unit,
    })),
    inventoryById,
    recipe.yieldQuantity,
  );

  return {
    _id: String(recipe._id),
    name: recipe.name,
    code: recipe.code,
    status: recipe.status,
    version: recipe.version,
    yieldQuantity: recipe.yieldQuantity,
    yieldUnit: recipe.yieldUnit,
    totalIngredientCostCents: recipeCost.totalIngredientCostCents,
    costPerYieldCents: recipeCost.costPerYieldCents,
    costStatus: recipeCost.status,
    ingredients: recipe.ingredients.map((ingredient, index) => ({
      inventoryItemId: String(ingredient.inventoryItemId),
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      preparationNote: ingredient.preparationNote,
      unitCostCents: recipeCost.ingredients[index]?.unitCostCents ?? null,
      ingredientCostCents: recipeCost.ingredients[index]?.ingredientCostCents ?? null,
      costStatus: recipeCost.ingredients[index]?.status ?? "missing_inventory",
      item: inventoryById.get(String(ingredient.inventoryItemId))
        ? {
            _id: String(inventoryById.get(String(ingredient.inventoryItemId))!._id),
            name: inventoryById.get(String(ingredient.inventoryItemId))!.name,
            sku: inventoryById.get(String(ingredient.inventoryItemId))!.sku,
            category: inventoryById.get(String(ingredient.inventoryItemId))!.category,
            baseUnit: inventoryById.get(String(ingredient.inventoryItemId))!.baseUnit,
          }
        : null,
    })),
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
  };
}

async function buildAdminRecipeDtos(recipes: AdminRecipeRecord[]) {
  const inventoryItemIds = [...new Set(recipes.flatMap((recipe) => recipe.ingredients.map((ingredient) => String(ingredient.inventoryItemId))))];
  const inventoryItems = inventoryItemIds.length > 0
    ? await InventoryItemModel.find({ _id: { $in: inventoryItemIds } }).select("name sku category baseUnit purchaseUnit purchasePriceCents packagingLevels").lean()
    : [];
  const inventoryById = new Map(inventoryItems.map((item) => [String(item._id), item]));

  return recipes.map((recipe) => toAdminRecipeDto(recipe, inventoryById));
}

function parseProductPayload(body: Record<string, unknown>) {
  const name = requiredString(body, "name", "Product name");
  const sku = requiredString(body, "sku", "SKU").toUpperCase();
  const type = optionalString(body, "type") ?? "prepared_item";
  const status = optionalString(body, "status") ?? "draft";
  const priceCents = requiredNumber(body, "priceCents", "Price");
  const laborCostCents = body.laborCostCents === undefined ? 0 : requiredNumber(body, "laborCostCents", "Labor cost");
  const otherCostCents = body.otherCostCents === undefined ? 0 : requiredNumber(body, "otherCostCents", "Other cost");
  const category = requiredString(body, "category", "Category");
  const recipeId = optionalString(body, "recipeId");

  if (name.length < 2 || name.length > 160) {
    throwValidationError("Product name must be between 2 and 160 characters long.");
  }

  if (!/^[A-Z0-9_.-]+$/.test(sku) || sku.length < 2 || sku.length > 64) {
    throwValidationError("SKU may only contain letters, numbers, underscores, periods, and hyphens, and must be 2 to 64 characters long.");
  }

  if (!PRODUCT_TYPES.includes(type as (typeof PRODUCT_TYPES)[number])) {
    throwValidationError("Product type is not supported.");
  }

  if (!PRODUCT_STATUSES.includes(status as (typeof PRODUCT_STATUSES)[number])) {
    throwValidationError("Product status is not supported.");
  }

  if (!Number.isInteger(priceCents) || priceCents < 0) {
    throwValidationError("Price must be a whole number of cents greater than or equal to 0.");
  }

  if (!Number.isInteger(laborCostCents) || laborCostCents < 0) {
    throwValidationError("Labor cost must be a whole number of cents greater than or equal to 0.");
  }

  if (!Number.isInteger(otherCostCents) || otherCostCents < 0) {
    throwValidationError("Other cost must be a whole number of cents greater than or equal to 0.");
  }

  if (category.length > 80) {
    throwValidationError("Category must be 80 characters or fewer.");
  }

  if (recipeId && !Types.ObjectId.isValid(recipeId)) {
    throwValidationError("Recipe is not valid.");
  }

  return {
    name,
    sku,
    type,
    status,
    priceCents,
    laborCostCents,
    otherCostCents,
    category,
    description: optionalString(body, "description"),
    recipeId: recipeId || undefined,
  };
}

function parseRecipePayload(body: Record<string, unknown>) {
  const name = requiredString(body, "name", "Recipe name");
  const code = requiredString(body, "code", "Recipe code").toUpperCase();
  const status = optionalString(body, "status") ?? "draft";
  const version = body.version === undefined ? 1 : requiredNumber(body, "version", "Version");
  const yieldQuantity = requiredNumber(body, "yieldQuantity", "Yield quantity");
  const yieldUnit = requiredString(body, "yieldUnit", "Yield unit").toLowerCase();
  const rawIngredients = body.ingredients;

  if (name.length < 2 || name.length > 160) {
    throwValidationError("Recipe name must be between 2 and 160 characters long.");
  }

  if (!/^[A-Z0-9_.-]+$/.test(code) || code.length < 2 || code.length > 64) {
    throwValidationError("Recipe code may only contain letters, numbers, underscores, periods, and hyphens, and must be 2 to 64 characters long.");
  }

  if (!RECIPE_STATUSES.includes(status as (typeof RECIPE_STATUSES)[number])) {
    throwValidationError("Recipe status is not supported.");
  }

  if (!Number.isInteger(version) || version < 1) {
    throwValidationError("Recipe version must be a positive whole number.");
  }

  if (!Number.isFinite(yieldQuantity) || yieldQuantity <= 0) {
    throwValidationError("Yield quantity must be greater than 0.");
  }

  if (!INVENTORY_UNITS.includes(yieldUnit as (typeof INVENTORY_UNITS)[number])) {
    throwValidationError("Yield unit is not supported.");
  }

  if (!Array.isArray(rawIngredients) || rawIngredients.length === 0 || rawIngredients.length > 100) {
    throwValidationError("A recipe must include between 1 and 100 ingredients.");
  }

  const ingredients = rawIngredients.map((rawIngredient, index) => {
    if (!rawIngredient || typeof rawIngredient !== "object" || Array.isArray(rawIngredient)) {
      throwValidationError(`Ingredient ${index + 1} is invalid.`);
    }

    const ingredient = rawIngredient as Record<string, unknown>;
    const inventoryItemId = requiredString(ingredient, "inventoryItemId", `Ingredient ${index + 1} inventory item`);
    const quantity = requiredNumber(ingredient, "quantity", `Ingredient ${index + 1} quantity`);
    const unit = requiredString(ingredient, "unit", `Ingredient ${index + 1} unit`).toLowerCase();
    const preparationNote = optionalString(ingredient, "preparationNote");

    if (!Types.ObjectId.isValid(inventoryItemId)) {
      throwValidationError(`Ingredient ${index + 1} inventory item is not valid.`);
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throwValidationError(`Ingredient ${index + 1} quantity must be greater than 0.`);
    }

    if (!INVENTORY_UNITS.includes(unit as (typeof INVENTORY_UNITS)[number])) {
      throwValidationError(`Ingredient ${index + 1} unit is not supported.`);
    }

    if (preparationNote && preparationNote.length > 300) {
      throwValidationError(`Ingredient ${index + 1} preparation note must be 300 characters or fewer.`);
    }

    return { inventoryItemId, quantity, unit, preparationNote };
  });

  if (new Set(ingredients.map((ingredient) => ingredient.inventoryItemId)).size !== ingredients.length) {
    throwValidationError("Each inventory item may only appear once in a recipe.");
  }

  return { name, code, status, version, yieldQuantity, yieldUnit, ingredients };
}

async function buildAdminInventoryDtos(items: AdminInventoryItemRecord[]) {
  const itemIds = items.map((item) => item._id);
  const stocks = await StoreStockModel.find({ inventoryItemId: { $in: itemIds } })
    .sort({ storeId: 1 })
    .lean();
  const storeIds = [...new Set(stocks.map((stock) => String(stock.storeId)))];
  const stores = await StoreModel.find({ _id: { $in: storeIds } }).select("name code slug status").lean();
  const storesById = new Map(stores.map((store) => [String(store._id), store]));
  const stocksByItemId = new Map<string, typeof stocks>();

  for (const stock of stocks) {
    const key = String(stock.inventoryItemId);
    const current = stocksByItemId.get(key) ?? [];
    current.push(stock);
    stocksByItemId.set(key, current);
  }

  return items.map((item) => toAdminInventoryDto(item, stocksByItemId.get(String(item._id)) ?? [], storesById));
}

type AdminInventoryRequestRecord = {
  _id: unknown;
  storeId: unknown;
  requestNumber: string;
  status: string;
  requestedByEmployeeId: unknown;
  stationId?: unknown;
  submittedAt?: Date | null;
  resolvedAt?: Date | null;
  notes?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

async function buildAdminInventoryRequestDtos(requests: AdminInventoryRequestRecord[]) {
  const requestIds = requests.map((request) => request._id);
  const lines = await InventoryRequestLineItemModel.find({ inventoryRequestId: { $in: requestIds } })
    .sort({ createdAt: 1 })
    .lean();
  const itemIds = [...new Set(lines.map((line) => String(line.inventoryItemId)))];
  const storeIds = [...new Set(requests.map((request) => String(request.storeId)))];
  const employeeIds = [...new Set(requests.map((request) => String(request.requestedByEmployeeId)))];
  const stationIds = [...new Set(requests.filter((request) => request.stationId).map((request) => String(request.stationId)))];
  const [items, stores, employees, stations, stocks] = await Promise.all([
    InventoryItemModel.find({ _id: { $in: itemIds } }).select("name sku category baseUnit").lean(),
    StoreModel.find({ _id: { $in: storeIds } }).select("name code slug status").lean(),
    StoreEmployeeModel.find({ _id: { $in: employeeIds } }).select("displayName employeeCode role status").lean(),
    StationModel.find({ _id: { $in: stationIds } }).select("name code status").lean(),
    StoreStockModel.find({ storeId: { $in: storeIds }, inventoryItemId: { $in: itemIds } })
      .select("storeId inventoryItemId quantityOnHand")
      .lean(),
  ]);
  const itemsById = new Map(items.map((item) => [String(item._id), item]));
  const storesById = new Map(stores.map((store) => [String(store._id), store]));
  const employeesById = new Map(employees.map((employee) => [String(employee._id), employee]));
  const stationsById = new Map(stations.map((station) => [String(station._id), station]));
  const stocksByKey = new Map(stocks.map((stock) => [`${String(stock.storeId)}:${String(stock.inventoryItemId)}`, stock]));

  return requests.map((request) => {
    const employee = employeesById.get(String(request.requestedByEmployeeId));
    const store = storesById.get(String(request.storeId));
    const station = request.stationId ? stationsById.get(String(request.stationId)) : null;

    return {
      _id: String(request._id),
      requestNumber: request.requestNumber,
      status: request.status,
      store: store
        ? {
            _id: String(store._id),
            name: store.name,
            storeNumber: store.code,
            slug: store.slug,
            status: store.status,
          }
        : null,
      requestedBy: employee
        ? {
            _id: String(employee._id),
            displayName: employee.displayName,
            employeeCode: employee.employeeCode,
            role: employee.role,
            status: employee.status,
          }
        : null,
      station: station
        ? {
            _id: String(station._id),
            name: station.name,
            code: station.code,
            status: station.status,
          }
        : null,
      submittedAt: request.submittedAt,
      resolvedAt: request.resolvedAt,
      notes: request.notes,
      lines: lines
        .filter((line) => String(line.inventoryRequestId) === String(request._id))
        .map((line) => {
          const item = itemsById.get(String(line.inventoryItemId));

          return {
            _id: String(line._id),
            inventoryItemId: String(line.inventoryItemId),
            item: item
              ? {
                  _id: String(item._id),
                  name: item.name,
                  sku: item.sku,
                  category: item.category,
                  baseUnit: item.baseUnit,
                }
              : null,
            requestedQuantity: line.requestedQuantity,
            approvedQuantity: line.approvedQuantity ?? null,
            fulfilledQuantity: line.fulfilledQuantity,
            availableQuantity: stocksByKey.get(`${String(request.storeId)}:${String(line.inventoryItemId)}`)?.quantityOnHand ?? null,
            status: line.status,
            notes: line.notes,
          };
        }),
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  });
}

adminRouter.get("/overview", async (_req, res, next) => {
  try {
    const [stores, stations, inventoryItems, recipes, products, inventoryRequests] = await Promise.all([
      StoreModel.countDocuments(),
      StationModel.countDocuments(),
      InventoryItemModel.countDocuments(),
      RecipeModel.countDocuments(),
      ProductModel.countDocuments(),
      InventoryRequestModel.countDocuments(),
    ]);

    res.json({
      counts: {
        stores,
        stations,
        inventoryItems,
        recipes,
        products,
        inventoryRequests,
      },
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/stores", async (_req, res, next) => {
  try {
    const stores = await StoreModel.find()
      .sort({ name: 1, code: 1 })
      .select("name code slug storeType status isActive timezone address phone email manager expectedOpenDate coverPhoto createdAt updatedAt")
      .lean();

    res.json({ stores: stores.map(toAdminStoreDto) });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/recipes", async (_req, res, next) => {
  try {
    const recipes = await RecipeModel.find()
      .sort({ status: 1, name: 1, version: -1 })
      .select("name code status version yieldQuantity yieldUnit ingredients createdAt updatedAt")
      .lean();

    res.json({ recipes: await buildAdminRecipeDtos(recipes) });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/recipes/:recipeId", async (req, res, next) => {
  try {
    const recipeId = String(req.params.recipeId);

    if (!Types.ObjectId.isValid(recipeId)) {
      res.status(404).json({ error: { message: "Recipe not found" } });
      return;
    }

    const recipe = await RecipeModel.findById(recipeId)
      .select("name code status version yieldQuantity yieldUnit ingredients createdAt updatedAt")
      .lean();

    if (!recipe) {
      res.status(404).json({ error: { message: "Recipe not found" } });
      return;
    }

    const [recipeDto] = await buildAdminRecipeDtos([recipe]);
    res.json({ recipe: recipeDto });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/recipes", async (req, res, next) => {
  try {
    const recipeInput = parseRecipePayload(req.body as Record<string, unknown>);
    const inventoryItemIds = recipeInput.ingredients.map((ingredient) => ingredient.inventoryItemId);
    const inventoryItemCount = await InventoryItemModel.countDocuments({ _id: { $in: inventoryItemIds } });

    if (inventoryItemCount !== inventoryItemIds.length) {
      res.status(404).json({ error: { message: "One or more recipe inventory items were not found" } });
      return;
    }

    const recipe = await RecipeModel.create(recipeInput);
    const [recipeDto] = await buildAdminRecipeDtos([recipe.toObject()]);
    res.status(201).json({ recipe: recipeDto });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === 11000) {
      next(Object.assign(new Error("A recipe with this code and version already exists."), { statusCode: 409 }));
      return;
    }

    next(error);
  }
});

adminRouter.put("/recipes/:recipeId", async (req, res, next) => {
  try {
    const recipeId = String(req.params.recipeId);

    if (!Types.ObjectId.isValid(recipeId)) {
      res.status(404).json({ error: { message: "Recipe not found" } });
      return;
    }

    const recipe = await RecipeModel.findById(recipeId);

    if (!recipe) {
      res.status(404).json({ error: { message: "Recipe not found" } });
      return;
    }

    const recipeInput = parseRecipePayload(req.body as Record<string, unknown>);
    const inventoryItemIds = recipeInput.ingredients.map((ingredient) => ingredient.inventoryItemId);
    const inventoryItemCount = await InventoryItemModel.countDocuments({ _id: { $in: inventoryItemIds } });

    if (inventoryItemCount !== inventoryItemIds.length) {
      res.status(404).json({ error: { message: "One or more recipe inventory items were not found" } });
      return;
    }

    recipe.set(recipeInput);
    await recipe.save();

    const [recipeDto] = await buildAdminRecipeDtos([recipe.toObject()]);
    res.json({ recipe: recipeDto });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === 11000) {
      next(Object.assign(new Error("A recipe with this code and version already exists."), { statusCode: 409 }));
      return;
    }

    next(error);
  }
});

adminRouter.get("/products", async (_req, res, next) => {
  try {
    const products = await ProductModel.find()
      .sort({ status: 1, category: 1, name: 1 })
      .select("name sku type status recipeId priceCents laborCostCents otherCostCents category description createdAt updatedAt")
      .lean();

    res.json({ products: await buildAdminProductDtos(products) });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/products/:productId", async (req, res, next) => {
  try {
    const productId = String(req.params.productId);

    if (!Types.ObjectId.isValid(productId)) {
      res.status(404).json({ error: { message: "Product not found" } });
      return;
    }

    const product = await ProductModel.findById(productId)
      .select("name sku type status recipeId priceCents laborCostCents otherCostCents category description createdAt updatedAt")
      .lean();

    if (!product) {
      res.status(404).json({ error: { message: "Product not found" } });
      return;
    }

    const [productDto] = await buildAdminProductDtos([product]);
    res.json({ product: productDto });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/products/:productId/cost", async (req, res, next) => {
  try {
    const productId = String(req.params.productId);

    if (!Types.ObjectId.isValid(productId)) {
      res.status(404).json({ error: { message: "Product not found" } });
      return;
    }

    const product = await ProductModel.findById(productId)
      .select("name sku type status recipeId priceCents laborCostCents otherCostCents category description createdAt updatedAt")
      .lean();

    if (!product) {
      res.status(404).json({ error: { message: "Product not found" } });
      return;
    }

    const [productDto] = await buildAdminProductDtos([product]);
    res.json({ productCost: toAdminProductCostDto(productDto) });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/products", async (req, res, next) => {
  try {
    const productInput = parseProductPayload(req.body as Record<string, unknown>);

    if (productInput.recipeId) {
      const recipeExists = await RecipeModel.exists({ _id: productInput.recipeId });

      if (!recipeExists) {
        res.status(404).json({ error: { message: "Recipe not found" } });
        return;
      }
    }

    const product = await ProductModel.create(productInput);
    const [productDto] = await buildAdminProductDtos([product.toObject()]);
    res.status(201).json({ product: productDto });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === 11000) {
      next(Object.assign(new Error("A product with this SKU already exists."), { statusCode: 409 }));
      return;
    }

    next(error);
  }
});

adminRouter.put("/products/:productId", async (req, res, next) => {
  try {
    const productId = String(req.params.productId);

    if (!Types.ObjectId.isValid(productId)) {
      res.status(404).json({ error: { message: "Product not found" } });
      return;
    }

    const product = await ProductModel.findById(productId);

    if (!product) {
      res.status(404).json({ error: { message: "Product not found" } });
      return;
    }

    const productInput = parseProductPayload(req.body as Record<string, unknown>);

    if (productInput.recipeId) {
      const recipeExists = await RecipeModel.exists({ _id: productInput.recipeId });

      if (!recipeExists) {
        res.status(404).json({ error: { message: "Recipe not found" } });
        return;
      }
    }

    product.set(productInput);
    await product.save();

    const [productDto] = await buildAdminProductDtos([product.toObject()]);
    res.json({ product: productDto });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === 11000) {
      next(Object.assign(new Error("A product with this SKU already exists."), { statusCode: 409 }));
      return;
    }

    next(error);
  }
});

adminRouter.get("/inventory", async (_req, res, next) => {
  try {
    const items = await InventoryItemModel.find()
      .sort({ status: 1, category: 1, name: 1 })
      .select("name sku category purchaseUnit baseUnit packagingLevels purchasePriceCents status description createdAt updatedAt")
      .lean();

    res.json({ inventory: await buildAdminInventoryDtos(items) });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/inventory/:inventoryItemId", async (req, res, next) => {
  try {
    const inventoryItemId = String(req.params.inventoryItemId);

    if (!Types.ObjectId.isValid(inventoryItemId)) {
      res.status(404).json({ error: { message: "Inventory item not found" } });
      return;
    }

    const item = await InventoryItemModel.findById(inventoryItemId)
      .select("name sku category purchaseUnit baseUnit packagingLevels purchasePriceCents status description createdAt updatedAt")
      .lean();

    if (!item) {
      res.status(404).json({ error: { message: "Inventory item not found" } });
      return;
    }

    const [inventoryItem] = await buildAdminInventoryDtos([item]);
    res.json({ inventoryItem });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/inventory", async (req, res, next) => {
  try {
    const input = parseInventoryPayload(req.body as Record<string, unknown>);
    const store = await StoreModel.findById(input.stock.storeId).select("name code slug status").lean();

    if (!store) {
      res.status(404).json({ error: { message: "Store not found" } });
      return;
    }

    const item = await InventoryItemModel.create(input.item);

    try {
      await StoreStockModel.create({
        storeId: input.stock.storeId,
        inventoryItemId: item._id,
        quantityOnHand: input.stock.quantityOnHand,
      });
    } catch (error) {
      await InventoryItemModel.deleteOne({ _id: item._id }).catch(() => undefined);
      throw error;
    }

    const [inventoryItem] = await buildAdminInventoryDtos([item.toObject()]);
    res.status(201).json({ inventoryItem });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === 11000) {
      next(Object.assign(new Error("An inventory item with this SKU already exists."), { statusCode: 409 }));
      return;
    }

    next(error);
  }
});

adminRouter.patch("/inventory/:inventoryItemId", async (req, res, next) => {
  try {
    const inventoryItemId = String(req.params.inventoryItemId);

    if (!Types.ObjectId.isValid(inventoryItemId)) {
      res.status(404).json({ error: { message: "Inventory item not found" } });
      return;
    }

    const item = await InventoryItemModel.findById(inventoryItemId);

    if (!item) {
      res.status(404).json({ error: { message: "Inventory item not found" } });
      return;
    }

    const input = parseInventoryItemUpdatePayload(req.body as Record<string, unknown>);
    item.set(input);
    await item.save();

    const [inventoryItem] = await buildAdminInventoryDtos([item.toObject()]);
    res.json({ inventoryItem });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === 11000) {
      next(Object.assign(new Error("An inventory item with this SKU already exists."), { statusCode: 409 }));
      return;
    }

    next(error);
  }
});

adminRouter.patch("/inventory/:inventoryItemId/packaging", async (req, res, next) => {
  try {
    const inventoryItemId = String(req.params.inventoryItemId);

    if (!Types.ObjectId.isValid(inventoryItemId)) {
      res.status(404).json({ error: { message: "Inventory item not found" } });
      return;
    }

    const item = await InventoryItemModel.findById(inventoryItemId);

    if (!item) {
      res.status(404).json({ error: { message: "Inventory item not found" } });
      return;
    }

    item.set("packagingLevels", parsePackagingLevels(
      (req.body as Record<string, unknown>).packagingLevels,
      item.purchaseUnit,
      item.baseUnit,
    ));
    await item.save();

    const [inventoryItem] = await buildAdminInventoryDtos([item.toObject()]);
    res.json({ inventoryItem });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/inventory/:inventoryItemId/stores/:storeId/stock", async (req, res, next) => {
  try {
    const inventoryItemId = String(req.params.inventoryItemId);
    const storeId = String(req.params.storeId);

    if (!Types.ObjectId.isValid(inventoryItemId) || !Types.ObjectId.isValid(storeId)) {
      res.status(404).json({ error: { message: "Inventory item or store not found" } });
      return;
    }

    const [item, store] = await Promise.all([
      InventoryItemModel.findById(inventoryItemId)
        .select("name sku category purchaseUnit baseUnit packagingLevels purchasePriceCents status description createdAt updatedAt")
        .lean(),
      StoreModel.findById(storeId).select("name code slug status").lean(),
    ]);

    if (!item || !store) {
      res.status(404).json({ error: { message: "Inventory item or store not found" } });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const quantityOnHand = requiredNumber(body, "quantityOnHand", "Quantity on hand");
    const reorderPoint = requiredNumber(body, "reorderPoint", "Reorder point");
    const parLevel = requiredNumber(body, "parLevel", "Par level");
    const status = requiredString(body, "status", "Stock status");

    if (quantityOnHand < 0 || reorderPoint < 0 || parLevel < 0) {
      throwValidationError("Stock quantities must be greater than or equal to 0.");
    }

    if (!STOCK_STATUSES.includes(status as (typeof STOCK_STATUSES)[number])) {
      throwValidationError("Stock status is not supported.");
    }

    await StoreStockModel.findOneAndUpdate(
      { storeId, inventoryItemId },
      { $set: { quantityOnHand, reorderPoint, parLevel, status } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );

    const [inventoryItem] = await buildAdminInventoryDtos([item]);
    res.json({ inventoryItem });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/inventory-requests", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const filter = status && INVENTORY_REQUEST_STATUSES.includes(status as (typeof INVENTORY_REQUEST_STATUSES)[number])
      ? { status }
      : {};
    const requests = await InventoryRequestModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ requests: await buildAdminInventoryRequestDtos(requests) });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/inventory-requests/:inventoryRequestId", async (req, res, next) => {
  try {
    const inventoryRequestId = String(req.params.inventoryRequestId);

    if (!Types.ObjectId.isValid(inventoryRequestId)) {
      res.status(404).json({ error: { message: "Inventory request not found" } });
      return;
    }

    const request = await InventoryRequestModel.findById(inventoryRequestId).lean();

    if (!request) {
      res.status(404).json({ error: { message: "Inventory request not found" } });
      return;
    }

    const [inventoryRequest] = await buildAdminInventoryRequestDtos([request]);
    res.json({ request: inventoryRequest });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/inventory-requests/:inventoryRequestId/decision", async (req, res, next) => {
  try {
    const inventoryRequestId = String(req.params.inventoryRequestId);

    if (!Types.ObjectId.isValid(inventoryRequestId)) {
      res.status(404).json({ error: { message: "Inventory request not found" } });
      return;
    }

    const request = await InventoryRequestModel.findById(inventoryRequestId);

    if (!request) {
      res.status(404).json({ error: { message: "Inventory request not found" } });
      return;
    }

    if (request.status !== "submitted") {
      next(Object.assign(new Error("Only submitted inventory requests can be approved or rejected."), { statusCode: 409 }));
      return;
    }

    const decision = requiredString(req.body as Record<string, unknown>, "decision", "Decision");

    if (decision !== "approve" && decision !== "reject") {
      throwValidationError("Decision must be approve or reject.");
    }

    const lineStatus = decision === "approve" ? "approved" : "rejected";
    const nextStatus = decision === "approve" ? "approved" : "rejected";

    if (!INVENTORY_REQUEST_LINE_STATUSES.includes(lineStatus) || !INVENTORY_REQUEST_STATUSES.includes(nextStatus)) {
      throwValidationError("Decision is not supported.");
    }

    const lines = await InventoryRequestLineItemModel.find({ inventoryRequestId }).lean();

    if (lines.length === 0) {
      next(Object.assign(new Error("An inventory request must contain at least one line item."), { statusCode: 409 }));
      return;
    }

    await Promise.all(
      lines.map((line) =>
        InventoryRequestLineItemModel.updateOne(
          { _id: line._id },
          {
            $set: {
              approvedQuantity: decision === "approve" ? line.requestedQuantity : 0,
              status: lineStatus,
            },
          },
        ),
      ),
    );

    const body = req.body as Record<string, unknown>;
    const decisionNotes = optionalString(body, "notes");
    request.set({
      status: nextStatus,
      resolvedAt: new Date(),
      ...(decisionNotes ? { notes: decisionNotes } : {}),
    });
    await request.save();

    const [requestDto] = await buildAdminInventoryRequestDtos([request.toObject()]);
    res.json({ request: requestDto });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/inventory-requests/:inventoryRequestId/fulfillment", async (req, res, next) => {
  try {
    const inventoryRequestId = String(req.params.inventoryRequestId);

    if (!Types.ObjectId.isValid(inventoryRequestId)) {
      res.status(404).json({ error: { message: "Inventory request not found" } });
      return;
    }

    const request = await InventoryRequestModel.findById(inventoryRequestId);

    if (!request) {
      res.status(404).json({ error: { message: "Inventory request not found" } });
      return;
    }

    if (request.status !== "approved" && request.status !== "partially_fulfilled") {
      next(Object.assign(new Error("Only approved inventory requests can be fulfilled."), { statusCode: 409 }));
      return;
    }

    const rawLines = (req.body as Record<string, unknown>).lines;

    if (!Array.isArray(rawLines) || rawLines.length === 0) {
      throwValidationError("Provide at least one fulfillment line.");
    }

    const fulfillmentInputs = rawLines.map((rawLine, index) => {
      if (!rawLine || typeof rawLine !== "object" || Array.isArray(rawLine)) {
        throwValidationError(`Fulfillment line ${index + 1} is invalid.`);
      }

      const line = rawLine as Record<string, unknown>;
      const lineId = requiredString(line, "lineId", `Fulfillment line ${index + 1} item`);
      const quantity = requiredNumber(line, "quantity", `Fulfillment line ${index + 1} quantity`);

      if (!Types.ObjectId.isValid(lineId) || quantity <= 0) {
        throwValidationError(`Fulfillment line ${index + 1} must contain a valid item and quantity greater than 0.`);
      }

      return { lineId, quantity };
    });

    if (new Set(fulfillmentInputs.map((line) => line.lineId)).size !== fulfillmentInputs.length) {
      throwValidationError("A request line may only be fulfilled once per update.");
    }

    const lines = await InventoryRequestLineItemModel.find({ inventoryRequestId }).lean();
    const linesById = new Map(lines.map((line) => [String(line._id), line]));
    const stockItemIds = lines.map((line) => line.inventoryItemId);
    const stocks = await StoreStockModel.find({ storeId: request.storeId, inventoryItemId: { $in: stockItemIds } }).lean();
    const stocksByItemId = new Map(stocks.map((stock) => [String(stock.inventoryItemId), stock]));

    for (const input of fulfillmentInputs) {
      const line = linesById.get(input.lineId);

      if (!line || (line.status !== "approved" && line.status !== "partially_fulfilled")) {
        next(Object.assign(new Error("Each fulfillment line must belong to an approved request."), { statusCode: 409 }));
        return;
      }

      const approvedQuantity = line.approvedQuantity ?? 0;
      const remainingQuantity = approvedQuantity - line.fulfilledQuantity;

      if (input.quantity > remainingQuantity) {
        next(Object.assign(new Error("Fulfilled quantity cannot exceed the approved remaining quantity."), { statusCode: 409 }));
        return;
      }

      const stock = stocksByItemId.get(String(line.inventoryItemId));

      if (!stock || stock.quantityOnHand < input.quantity) {
        next(Object.assign(new Error("Store stock is insufficient for one or more fulfillment lines."), { statusCode: 409 }));
        return;
      }
    }

    const updatedQuantityByLineId = new Map<string, number>();

    for (const input of fulfillmentInputs) {
      const line = linesById.get(input.lineId)!;
      const stock = stocksByItemId.get(String(line.inventoryItemId))!;
      const nextStockQuantity = stock.quantityOnHand - input.quantity;
      const nextStockStatus = stock.status === "inactive"
        ? "inactive"
        : nextStockQuantity <= 0
          ? "out_of_stock"
          : nextStockQuantity <= stock.reorderPoint
            ? "low_stock"
            : "in_stock";

      await StoreStockModel.updateOne(
        { _id: stock._id },
        { $inc: { quantityOnHand: -input.quantity }, $set: { status: nextStockStatus } },
      );
      stock.quantityOnHand = nextStockQuantity;

      const nextFulfilledQuantity = line.fulfilledQuantity + input.quantity;
      const nextLineStatus = nextFulfilledQuantity >= (line.approvedQuantity ?? 0) ? "fulfilled" : "partially_fulfilled";
      updatedQuantityByLineId.set(input.lineId, nextFulfilledQuantity);
      await InventoryRequestLineItemModel.updateOne(
        { _id: line._id },
        { $set: { fulfilledQuantity: nextFulfilledQuantity, status: nextLineStatus } },
      );
    }

    const allFulfilled = lines.every((line) => {
      const fulfilledQuantity = updatedQuantityByLineId.get(String(line._id)) ?? line.fulfilledQuantity;
      return fulfilledQuantity >= (line.approvedQuantity ?? 0);
    });
    const hasFulfillment = lines.some((line) => {
      const fulfilledQuantity = updatedQuantityByLineId.get(String(line._id)) ?? line.fulfilledQuantity;
      return fulfilledQuantity > 0;
    });

    request.set({
      status: allFulfilled ? "fulfilled" : hasFulfillment ? "partially_fulfilled" : "approved",
    });
    await request.save();

    const [requestDto] = await buildAdminInventoryRequestDtos([request.toObject()]);
    res.json({ request: requestDto });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/stations", async (_req, res, next) => {
  try {
    const stations = await StationModel.find().sort({ storeId: 1, sortOrder: 1, name: 1 }).lean();
    const storeIds = [...new Set(stations.map((station) => String(station.storeId)))];
    const stores = await StoreModel.find({ _id: { $in: storeIds } }).select("name code slug status").lean();
    const storesById = new Map(stores.map((store) => [String(store._id), store]));

    res.json({
      stations: stations.map((station) => toAdminStationDto(station, storesById.get(String(station.storeId)) ?? null)),
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/stations/:stationId", async (req, res, next) => {
  try {
    const stationId = String(req.params.stationId);

    if (!Types.ObjectId.isValid(stationId)) {
      res.status(404).json({ error: { message: "Station not found" } });
      return;
    }

    const station = await StationModel.findById(stationId).lean();

    if (!station) {
      res.status(404).json({ error: { message: "Station not found" } });
      return;
    }

    const store = await StoreModel.findById(station.storeId).select("name code slug status").lean();

    res.json({ station: toAdminStationDto(station, store) });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/stations", async (req, res, next) => {
  try {
    const stationInput = parseStationPayload(req.body as Record<string, unknown>);
    const store = await StoreModel.findById(stationInput.storeId).select("name code slug status").lean();

    if (!store) {
      res.status(404).json({ error: { message: "Store not found" } });
      return;
    }

    const station = await StationModel.create(stationInput);

    res.status(201).json({ station: toAdminStationDto(station.toObject(), store) });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === 11000) {
      next(Object.assign(new Error("A station with this code already exists for this store."), { statusCode: 409 }));
      return;
    }

    next(error);
  }
});

adminRouter.get("/stores/:storeId", async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId);

    if (!Types.ObjectId.isValid(storeId)) {
      res.status(404).json({ error: { message: "Store not found" } });
      return;
    }

    const store = await StoreModel.findById(storeId)
      .select("name code slug storeType status isActive timezone address phone email manager expectedOpenDate coverPhoto createdAt updatedAt")
      .lean();

    if (!store) {
      res.status(404).json({ error: { message: "Store not found" } });
      return;
    }

    res.json(await buildAdminStoreDetail(store));
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/stores/:storeId/employees", async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId);

    if (!Types.ObjectId.isValid(storeId)) {
      res.status(404).json({ error: { message: "Store not found" } });
      return;
    }

    const store = await StoreModel.findById(storeId).select("name code slug").lean();

    if (!store) {
      res.status(404).json({ error: { message: "Store not found" } });
      return;
    }

    res.json({
      store: {
        _id: String(store._id),
        name: store.name,
        storeNumber: store.code,
        slug: store.slug,
      },
      employees: await buildStoreEmployeeDtos(store),
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/stores/:storeId/employees/:employeeId", async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId);
    const employeeId = String(req.params.employeeId);

    if (!Types.ObjectId.isValid(storeId) || !Types.ObjectId.isValid(employeeId)) {
      res.status(404).json({ error: { message: "Employee not found" } });
      return;
    }

    const [store, employee] = await Promise.all([
      StoreModel.findById(storeId).select("name code slug").lean(),
      StoreEmployeeModel.findOne({ _id: employeeId, storeId }).lean(),
    ]);

    if (!store || !employee) {
      res.status(404).json({ error: { message: "Employee not found" } });
      return;
    }

    const user = employee.userAccountId
      ? await UserAccountModel.findById(employee.userAccountId).select("displayName email role status").lean()
      : null;

    res.json({ employee: toStoreEmployeeDto(employee, store, user) });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/stores", handleStoreCoverUpload, async (req, res, next) => {
  const uploadedCoverPhoto = req.file;

  try {
    const body = req.body as Record<string, unknown>;
    const storeInput = parseStorePayload(body);
    const coverPhoto = uploadedCoverPhoto ? toCoverPhoto(uploadedCoverPhoto) : undefined;

    const store = await StoreModel.create({
      ...storeInput,
      coverPhoto,
    });

    res.status(201).json(await buildAdminStoreDetail(store.toObject()));
  } catch (error) {
    await removeUploadedFile(uploadedCoverPhoto);

    if (error instanceof Error && "code" in error && error.code === 11000) {
      next(Object.assign(new Error("A store with this store number already exists."), { statusCode: 409 }));
      return;
    }

    next(error);
  }
});

adminRouter.put("/stores/:storeId", handleStoreCoverUpload, async (req, res, next) => {
  const uploadedCoverPhoto = req.file;

  try {
    const storeId = String(req.params.storeId);

    if (!Types.ObjectId.isValid(storeId)) {
      await removeUploadedFile(uploadedCoverPhoto);
      res.status(404).json({ error: { message: "Store not found" } });
      return;
    }

    const store = await StoreModel.findById(storeId);

    if (!store) {
      await removeUploadedFile(uploadedCoverPhoto);
      res.status(404).json({ error: { message: "Store not found" } });
      return;
    }

    const storeInput = parseStorePayload(req.body as Record<string, unknown>);
    store.set({
      ...storeInput,
      ...(uploadedCoverPhoto ? { coverPhoto: toCoverPhoto(uploadedCoverPhoto) } : {}),
    });

    await store.save();

    res.json(await buildAdminStoreDetail(store.toObject()));
  } catch (error) {
    await removeUploadedFile(uploadedCoverPhoto);

    if (error instanceof Error && "code" in error && error.code === 11000) {
      next(Object.assign(new Error("A store with this store number already exists."), { statusCode: 409 }));
      return;
    }

    next(error);
  }
});

adminRouter.post("/stores/:storeId/employees", async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId);

    if (!Types.ObjectId.isValid(storeId)) {
      res.status(404).json({ error: { message: "Store not found" } });
      return;
    }

    const store = await StoreModel.findById(storeId)
      .select("name code slug storeType status isActive timezone address phone email manager expectedOpenDate coverPhoto createdAt updatedAt")
      .lean();

    if (!store) {
      res.status(404).json({ error: { message: "Store not found" } });
      return;
    }

    const employeeInput = parseEmployeePayload(req.body as Record<string, unknown>, storeId);
    await StoreEmployeeModel.create(employeeInput);

    res.status(201).json(await buildAdminStoreDetail(store));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === 11000) {
      next(Object.assign(new Error("An employee with this code already exists for this store."), { statusCode: 409 }));
      return;
    }

    next(error);
  }
});

adminRouter.post("/stores/:storeId/manager", async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId);

    if (!Types.ObjectId.isValid(storeId)) {
      res.status(404).json({ error: { message: "Store not found" } });
      return;
    }

    const store = await StoreModel.findById(storeId)
      .select("name code slug storeType status isActive timezone address phone email manager expectedOpenDate coverPhoto createdAt updatedAt")
      .lean();

    if (!store) {
      res.status(404).json({ error: { message: "Store not found" } });
      return;
    }

    const existingManager = await StoreEmployeeModel.findOne({
      storeId,
      role: "manager",
      status: { $ne: "terminated" },
    }).lean();

    if (existingManager) {
      next(Object.assign(new Error("This store already has a manager assignment."), { statusCode: 409 }));
      return;
    }

    const managerInput = parseManagerPayload(req.body as Record<string, unknown>, storeId);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const user = await UserAccountModel.create({
      ...managerInput.account,
      passwordHash,
    });

    try {
      await StoreEmployeeModel.create({
        storeId: managerInput.storeId,
        userAccountId: user._id,
        ...managerInput.assignment,
      });
    } catch (error) {
      await UserAccountModel.deleteOne({ _id: user._id }).catch(() => undefined);
      throw error;
    }

    res.status(201).json({
      ...(await buildAdminStoreDetail(store)),
      managerCredentials: {
        email: managerInput.account.email,
        temporaryPassword,
        delivery:
          "Share this temporary password with the manager through a secure channel. It is shown only in this response, and login is allowed only while the account status is Active.",
      },
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === 11000) {
      next(Object.assign(new Error("A manager account with this email or employee code already exists."), { statusCode: 409 }));
      return;
    }

    next(error);
  }
});
