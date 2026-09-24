import { calculateSmallestUnitCostCents } from "./inventory-cost.js";
import { calculateProductCostCents } from "./product-cost.js";
import { calculateRecipeCost } from "./recipe-cost.js";

const inventoryItem = {
  purchaseUnit: "case",
  baseUnit: "each",
  purchasePriceCents: 1200,
  packagingLevels: [{ parentUnit: "case", childUnit: "each", quantity: 12 }],
};

function calculateAffectedProductCost() {
  const unitCostCents = calculateSmallestUnitCostCents(inventoryItem);
  const recipeCost = calculateRecipeCost(
    [{ inventoryItemId: "flour", quantity: 2, unit: "each" }],
    new Map([["flour", { ...inventoryItem }]]),
    1,
  );

  return calculateProductCostCents({
    ingredientCostCents: recipeCost.costPerYieldCents,
    laborCostCents: 50,
    otherCostCents: 20,
  }) ?? unitCostCents;
}

const initialProductCostCents = calculateAffectedProductCost();
if (initialProductCostCents !== 270) {
  throw new Error(`Unexpected initial affected product cost: ${initialProductCostCents}`);
}

inventoryItem.purchasePriceCents = 1800;
const changedPriceProductCostCents = calculateAffectedProductCost();
if (changedPriceProductCostCents !== 370) {
  throw new Error(`Purchase price change did not recalculate affected cost: ${changedPriceProductCostCents}`);
}

inventoryItem.purchasePriceCents = 1200;
inventoryItem.packagingLevels = [{ parentUnit: "case", childUnit: "each", quantity: 24 }];
const changedPackagingProductCostCents = calculateAffectedProductCost();
if (changedPackagingProductCostCents !== 170) {
  throw new Error(`Packaging change did not recalculate affected cost: ${changedPackagingProductCostCents}`);
}

console.log("ok source cost changes recalculate affected recipe and product costs");
