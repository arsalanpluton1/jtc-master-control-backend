import { Router } from "express";
import {
  InventoryItemModel,
  InventoryRequestModel,
  ProductModel,
  RecipeModel,
  StationModel,
  StoreModel,
} from "../../models/index.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("admin"));

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
      .sort({ name: 1 })
      .select("name code slug status timezone address city createdAt updatedAt")
      .lean();

    res.json({ stores });
  } catch (error) {
    next(error);
  }
});
