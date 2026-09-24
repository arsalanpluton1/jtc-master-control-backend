export type RecipeCostPackagingLevel = {
  parentUnit: string;
  childUnit: string;
  quantity: number;
};

export type RecipeCostInventory = {
  baseUnit: string;
  purchaseUnit?: string;
  purchasePriceCents?: number;
  packagingLevels?: RecipeCostPackagingLevel[];
};

export type RecipeCostIngredient = {
  inventoryItemId: string;
  quantity: number;
  unit: string;
};

export type RecipeIngredientCostStatus =
  | "calculated"
  | "missing_inventory"
  | "missing_unit_cost"
  | "unit_not_available";

export type RecipeIngredientCost = {
  inventoryItemId: string;
  unitCostCents: number | null;
  ingredientCostCents: number | null;
  status: RecipeIngredientCostStatus;
};

export type RecipeCostSummary = {
  ingredients: RecipeIngredientCost[];
  totalIngredientCostCents: number | null;
  costPerYieldCents: number | null;
  status: "calculated" | "incomplete";
};

function roundCost(value: number) {
  return Number(value.toFixed(6));
}

/**
 * Calculates a cost for any unit on the inventory item's purchase-to-smallest
 * packaging chain. A null result means the requested recipe unit is not
 * connected to the item's purchase unit or the purchase cost is unavailable.
 */
export function calculateInventoryUnitCostCents(item: RecipeCostInventory, requestedUnit: string) {
  if (
    item.purchaseUnit === undefined ||
    item.purchasePriceCents === undefined ||
    !Number.isFinite(item.purchasePriceCents) ||
    item.purchasePriceCents < 0
  ) {
    return null;
  }

  if (requestedUnit === item.purchaseUnit) {
    return item.purchasePriceCents;
  }

  const levelsByParent = new Map(item.packagingLevels?.map((level) => [level.parentUnit, level]) ?? []);
  const visited = new Set<string>();
  let currentUnit = item.purchaseUnit;
  let unitsPerPurchaseUnit = 1;

  while (currentUnit !== requestedUnit) {
    if (visited.has(currentUnit)) {
      return null;
    }

    visited.add(currentUnit);
    const level = levelsByParent.get(currentUnit);

    if (!level || !Number.isInteger(level.quantity) || level.quantity < 1) {
      return null;
    }

    unitsPerPurchaseUnit *= level.quantity;

    if (!Number.isSafeInteger(unitsPerPurchaseUnit)) {
      return null;
    }

    currentUnit = level.childUnit;
  }

  return roundCost(item.purchasePriceCents / unitsPerPurchaseUnit);
}

export function calculateRecipeIngredientCost(
  ingredient: RecipeCostIngredient,
  inventoryItem?: RecipeCostInventory,
): RecipeIngredientCost {
  if (!inventoryItem) {
    return {
      inventoryItemId: ingredient.inventoryItemId,
      unitCostCents: null,
      ingredientCostCents: null,
      status: "missing_inventory",
    };
  }

  const unitCostCents = calculateInventoryUnitCostCents(inventoryItem, ingredient.unit);

  if (unitCostCents === null) {
    const hasPurchaseCost = inventoryItem.purchaseUnit !== undefined
      && inventoryItem.purchasePriceCents !== undefined
      && Number.isFinite(inventoryItem.purchasePriceCents);

    return {
      inventoryItemId: ingredient.inventoryItemId,
      unitCostCents: null,
      ingredientCostCents: null,
      status: hasPurchaseCost ? "unit_not_available" : "missing_unit_cost",
    };
  }

  return {
    inventoryItemId: ingredient.inventoryItemId,
    unitCostCents,
    ingredientCostCents: roundCost(unitCostCents * ingredient.quantity),
    status: "calculated",
  };
}

export function calculateRecipeCost(
  ingredients: RecipeCostIngredient[],
  inventoryById: Map<string, RecipeCostInventory>,
  yieldQuantity: number,
): RecipeCostSummary {
  const ingredientCosts = ingredients.map((ingredient) =>
    calculateRecipeIngredientCost(ingredient, inventoryById.get(ingredient.inventoryItemId)),
  );
  const isComplete = ingredientCosts.every((ingredient) => ingredient.status === "calculated");
  const totalIngredientCostCents = isComplete
    ? roundCost(ingredientCosts.reduce((total, ingredient) => total + (ingredient.ingredientCostCents ?? 0), 0))
    : null;

  return {
    ingredients: ingredientCosts,
    totalIngredientCostCents,
    costPerYieldCents: totalIngredientCostCents !== null && yieldQuantity > 0
      ? roundCost(totalIngredientCostCents / yieldQuantity)
      : null,
    status: isComplete ? "calculated" : "incomplete",
  };
}
