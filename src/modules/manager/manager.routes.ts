import { Router } from "express";
import {
  InventoryRequestModel,
  StationModel,
  StoreModel,
  StoreStockModel,
} from "../../models/index.js";
import { assertStoreAccess, requireAuth, requireRole } from "../auth/auth.middleware.js";

export const managerRouter = Router();

managerRouter.use(requireAuth, requireRole("admin", "manager"));

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
