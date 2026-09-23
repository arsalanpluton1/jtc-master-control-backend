import { Router } from "express";
import { Types } from "mongoose";
import {
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
