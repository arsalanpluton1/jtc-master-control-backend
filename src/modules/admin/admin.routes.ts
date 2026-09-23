import { Router, type RequestHandler } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { Types } from "mongoose";
import {
  InventoryItemModel,
  InventoryRequestModel,
  ProductModel,
  RecipeModel,
  StationModel,
  StoreEmployeeModel,
  StoreModel,
  UserAccountModel,
} from "../../models/index.js";
import {
  STATION_STATUSES,
  STORE_EMPLOYEE_ROLES,
  STORE_EMPLOYEE_STATUSES,
  STORE_STATUSES,
  STORE_TYPES,
  USER_ACCOUNT_STATUSES,
} from "../../models/model.constants.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { generateTemporaryPassword, hashPassword } from "../auth/password.service.js";

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
  const sortOrderValue = optionalString(body, "sortOrder") ?? "0";
  const sortOrder = Number(sortOrderValue);

  if (!Types.ObjectId.isValid(storeId)) {
    throwValidationError("Store is not valid.");
  }

  if (!/^[A-Z0-9_-]+$/.test(code)) {
    throwValidationError("Station code may only contain letters, numbers, underscores, and hyphens.");
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
