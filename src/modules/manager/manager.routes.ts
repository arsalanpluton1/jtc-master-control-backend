import { Router } from "express";
import { Types } from "mongoose";
import {
  InventoryItemModel,
  InventoryRequestLineItemModel,
  InventoryRequestModel,
  StationModel,
  StoreEmployeeModel,
  StoreModel,
  StoreStockModel,
  UserAccountModel,
} from "../../models/index.js";
import { assertStoreAccess, requireAuth, requireRole } from "../auth/auth.middleware.js";

export const managerRouter = Router();

managerRouter.use(requireAuth, requireRole("admin", "manager"));

type ManagerEmployeeStore = {
  _id: unknown;
  name: string;
  code: string;
  slug: string;
};

type ManagerEmployeeUser = {
  _id: unknown;
  displayName: string;
  email: string;
  role: string;
  status: string;
} | null;

type ManagerInventoryItemRecord = {
  _id: unknown;
  name: string;
  sku: string;
  category: string;
  baseUnit: string;
  smallestUnitCostCents?: number | null;
};

function throwValidationError(message: string): never {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 400;
  throw error;
}

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

function requiredNumber(body: Record<string, unknown>, key: string, label: string) {
  const value = body[key];
  const numberValue =
    typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;

  if (!Number.isFinite(numberValue)) {
    throwValidationError(`${label} is required and must be a number.`);
  }

  return numberValue;
}

function requestNumber() {
  return `REQ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function toManagerInventoryDto(
  stock: {
    _id: unknown;
    quantityOnHand: number;
    reorderPoint: number;
    parLevel: number;
    status: string;
    inventoryItemId: unknown;
  },
  item: ManagerInventoryItemRecord,
) {
  return {
    _id: String(stock._id),
    inventoryItemId: String(stock.inventoryItemId),
    item: {
      _id: String(item._id),
      name: item.name,
      sku: item.sku,
      category: item.category,
      baseUnit: item.baseUnit,
      smallestUnitCostCents: item.smallestUnitCostCents ?? null,
    },
    quantityOnHand: stock.quantityOnHand,
    reorderPoint: stock.reorderPoint,
    parLevel: stock.parLevel,
    status: stock.status,
  };
}

async function buildManagerRequestDtos(requests: Array<{ _id: unknown; storeId: unknown; requestNumber: string; status: string; requestedByEmployeeId: unknown; stationId?: unknown; submittedAt?: Date | null; notes?: string | null; createdAt?: Date; updatedAt?: Date }>) {
  const requestIds = requests.map((request) => request._id);
  const lines = await InventoryRequestLineItemModel.find({ inventoryRequestId: { $in: requestIds } }).sort({ createdAt: 1 }).lean();
  const itemIds = [...new Set(lines.map((line) => String(line.inventoryItemId)))];
  const items = await InventoryItemModel.find({ _id: { $in: itemIds } })
    .select("name sku category baseUnit")
    .lean();
  const itemsById = new Map(items.map((item) => [String(item._id), item]));
  const employeeIds = [...new Set(requests.map((request) => String(request.requestedByEmployeeId)))];
  const employees = await StoreEmployeeModel.find({ _id: { $in: employeeIds } }).select("displayName employeeCode").lean();
  const employeesById = new Map(employees.map((employee) => [String(employee._id), employee]));

  return requests.map((request) => ({
    _id: String(request._id),
    requestNumber: request.requestNumber,
    status: request.status,
    requestedByEmployee: employeesById.get(String(request.requestedByEmployeeId))
      ? {
          _id: String(request.requestedByEmployeeId),
          displayName: employeesById.get(String(request.requestedByEmployeeId))?.displayName,
          employeeCode: employeesById.get(String(request.requestedByEmployeeId))?.employeeCode,
        }
      : null,
    stationId: request.stationId ? String(request.stationId) : null,
    submittedAt: request.submittedAt,
    notes: request.notes,
    lines: lines
      .filter((line) => String(line.inventoryRequestId) === String(request._id))
      .map((line) => ({
        _id: String(line._id),
        inventoryItemId: String(line.inventoryItemId),
        item: itemsById.get(String(line.inventoryItemId))
          ? {
              _id: String(itemsById.get(String(line.inventoryItemId))?._id),
              name: itemsById.get(String(line.inventoryItemId))?.name,
              sku: itemsById.get(String(line.inventoryItemId))?.sku,
              baseUnit: itemsById.get(String(line.inventoryItemId))?.baseUnit,
            }
          : null,
        requestedQuantity: line.requestedQuantity,
        approvedQuantity: line.approvedQuantity ?? null,
        fulfilledQuantity: line.fulfilledQuantity,
        status: line.status,
        notes: line.notes,
      })),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  }));
}

function toManagerStoreEmployeeDto(
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
  store: ManagerEmployeeStore,
  user: ManagerEmployeeUser = null,
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

managerRouter.get("/stores/:storeId/inventory", assertStoreAccess, async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const store = await StoreModel.findById(storeId).select("name code slug status").lean();

    if (!store) {
      res.status(404).json({ error: { message: "Store not found" } });
      return;
    }

    const stocks = await StoreStockModel.find({ storeId }).sort({ status: 1, inventoryItemId: 1 }).lean();
    const itemIds = stocks.map((stock) => stock.inventoryItemId);
    const items = await InventoryItemModel.find({ _id: { $in: itemIds } })
      .select("name sku category baseUnit")
      .lean();
    const itemsById = new Map(items.map((item) => [String(item._id), item]));

    res.json({
      store: { _id: String(store._id), name: store.name, storeNumber: store.code, slug: store.slug },
      inventory: stocks
        .map((stock) => {
          const item = itemsById.get(String(stock.inventoryItemId));
          return item ? toManagerInventoryDto(stock, item) : null;
        })
        .filter(Boolean),
    });
  } catch (error) {
    next(error);
  }
});

managerRouter.get("/stores/:storeId/stations", assertStoreAccess, async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const stations = await StationModel.find({ storeId }).sort({ sortOrder: 1, name: 1 }).select("name code status sortOrder").lean();
    res.json({ stations });
  } catch (error) {
    next(error);
  }
});

managerRouter.get("/stores/:storeId/inventory-requests", assertStoreAccess, async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const requests = await InventoryRequestModel.find({ storeId }).sort({ createdAt: -1 }).lean();
    res.json({ requests: await buildManagerRequestDtos(requests) });
  } catch (error) {
    next(error);
  }
});

managerRouter.post("/stores/:storeId/inventory-requests", assertStoreAccess, async (req, res, next) => {
  try {
    const storeId = String(req.params.storeId);
    const employeeId = req.auth?.storeEmployeeId;
    const body = req.body as Record<string, unknown>;
    const rawItems = body.items;

    if (!employeeId || !Types.ObjectId.isValid(employeeId)) {
      const error = new Error("An active store manager employee context is required.") as Error & { statusCode: number };
      error.statusCode = 403;
      throw error;
    }

    if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 100) {
      throwValidationError("A request must contain between 1 and 100 inventory items.");
    }

    if (!Types.ObjectId.isValid(storeId)) {
      res.status(404).json({ error: { message: "Store not found" } });
      return;
    }

    const itemInputs = rawItems.map((rawItem, index) => {
      if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
        throwValidationError(`Request item ${index + 1} is invalid.`);
      }

      const item = rawItem as Record<string, unknown>;
      const inventoryItemId = requiredString(item, "inventoryItemId", `Request item ${index + 1} inventory item`);
      const requestedQuantity = requiredNumber(item, "requestedQuantity", `Request item ${index + 1} quantity`);

      if (!Types.ObjectId.isValid(inventoryItemId)) {
        throwValidationError(`Request item ${index + 1} inventory item is invalid.`);
      }

      if (requestedQuantity <= 0) {
        throwValidationError(`Request item ${index + 1} quantity must be greater than 0.`);
      }

      const notes = typeof item.notes === "string" ? item.notes.trim() || undefined : undefined;

      if (notes && notes.length > 500) {
        throwValidationError(`Request item ${index + 1} notes may not exceed 500 characters.`);
      }

      return {
        inventoryItemId,
        requestedQuantity,
        notes,
      };
    });

    const itemIds = itemInputs.map((item) => item.inventoryItemId);

    if (new Set(itemIds).size !== itemIds.length) {
      throwValidationError("An inventory item may only appear once in a request.");
    }

    const [store, stocks, items] = await Promise.all([
      StoreModel.findById(storeId).select("name code slug status").lean(),
      StoreStockModel.find({ storeId, inventoryItemId: { $in: itemIds } }).select("inventoryItemId").lean(),
      InventoryItemModel.find({ _id: { $in: itemIds } }).select("_id").lean(),
    ]);

    if (!store) {
      res.status(404).json({ error: { message: "Store not found" } });
      return;
    }

    if (items.length !== itemIds.length || stocks.length !== itemIds.length) {
      throwValidationError("Every requested inventory item must be available at the selected store.");
    }

    const stationId = optionalString(body, "stationId");

    if (stationId && (!Types.ObjectId.isValid(stationId) || !(await StationModel.exists({ _id: stationId, storeId })))) {
      throwValidationError("Station is not valid for the selected store.");
    }

    const notes = optionalString(body, "notes");

    if (notes && notes.length > 1000) {
      throwValidationError("Request notes may not exceed 1000 characters.");
    }

    const request = await InventoryRequestModel.create({
      storeId,
      requestNumber: requestNumber(),
      status: "submitted",
      requestedByEmployeeId: employeeId,
      stationId: stationId || undefined,
      submittedAt: new Date(),
      notes,
    });

    try {
      await InventoryRequestLineItemModel.insertMany(
        itemInputs.map((item) => ({
          storeId,
          inventoryRequestId: request._id,
          inventoryItemId: item.inventoryItemId,
          requestedQuantity: item.requestedQuantity,
          notes: item.notes,
        })),
      );
    } catch (error) {
      await InventoryRequestModel.deleteOne({ _id: request._id }).catch(() => undefined);
      throw error;
    }

    const [requestDto] = await buildManagerRequestDtos([request.toObject()]);
    res.status(201).json({ request: requestDto });
  } catch (error) {
    next(error);
  }
});

managerRouter.get("/stores/:storeId/summary", assertStoreAccess, async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const [store, stations, stockItems, openInventoryRequests] = await Promise.all([
      StoreModel.findById(storeId).select("name code slug status timezone address").lean(),
      StationModel.countDocuments({ storeId }),
      StoreStockModel.countDocuments({ storeId }),
      InventoryRequestModel.countDocuments({
        storeId,
        status: { $in: ["draft", "submitted", "approved", "partially_fulfilled"] },
      }),
    ]);

    if (!store) {
      res.status(404).json({ error: { message: "Store not found" } });
      return;
    }

    res.json({
      store,
      counts: {
        stations,
        stockItems,
        openInventoryRequests,
      },
    });
  } catch (error) {
    next(error);
  }
});

managerRouter.get("/stores/:storeId/employees", assertStoreAccess, async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const store = await StoreModel.findById(storeId).select("name code slug").lean();

    if (!store) {
      res.status(404).json({ error: { message: "Store not found" } });
      return;
    }

    const employees = await StoreEmployeeModel.find({ storeId })
      .sort({ role: 1, employeeCode: 1, displayName: 1, createdAt: 1 })
      .lean();
    const userIds = employees.map((employee) => employee.userAccountId).filter(Boolean);
    const users = await UserAccountModel.find({ _id: { $in: userIds } })
      .select("displayName email role status")
      .lean();
    const usersById = new Map(users.map((user) => [String(user._id), user]));

    res.json({
      store: {
        _id: String(store._id),
        name: store.name,
        storeNumber: store.code,
        slug: store.slug,
      },
      employees: employees.map((employee) =>
        toManagerStoreEmployeeDto(employee, store, usersById.get(String(employee.userAccountId)) ?? null),
      ),
    });
  } catch (error) {
    next(error);
  }
});

managerRouter.get("/stores/:storeId/employees/:employeeId", assertStoreAccess, async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const employeeId = String(req.params.employeeId);

    if (!Types.ObjectId.isValid(employeeId)) {
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

    res.json({ employee: toManagerStoreEmployeeDto(employee, store, user) });
  } catch (error) {
    next(error);
  }
});
