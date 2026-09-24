import { calculateRecipeCost } from "./recipe-cost.js";

const inventory = new Map([
  ["glass", {
    purchaseUnit: "case",
    baseUnit: "each",
    purchasePriceCents: 336,
    packagingLevels: [
      { parentUnit: "case", childUnit: "inner", quantity: 12 },
      { parentUnit: "inner", childUnit: "each", quantity: 28 },
    ],
  }],
]);

const calculated = calculateRecipeCost(
  [
    { inventoryItemId: "glass", quantity: 2, unit: "each" },
    { inventoryItemId: "glass", quantity: 0.5, unit: "case" },
  ],
  inventory,
  2,
);

if (calculated.totalIngredientCostCents !== 170 || calculated.costPerYieldCents !== 85 || calculated.status !== "calculated") {
  throw new Error(`Unexpected recipe cost result: ${JSON.stringify(calculated)}`);
}

const incomplete = calculateRecipeCost(
  [{ inventoryItemId: "glass", quantity: 1, unit: "liter" }],
  inventory,
  1,
);

if (incomplete.totalIngredientCostCents !== null || incomplete.ingredients[0]?.status !== "unit_not_available") {
  throw new Error(`Unexpected incomplete recipe cost result: ${JSON.stringify(incomplete)}`);
}

console.log("ok recipe cost conversion and incomplete-cost handling");
