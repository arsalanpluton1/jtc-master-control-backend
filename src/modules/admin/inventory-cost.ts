export type InventoryPackagingLevelForCost = {
  parentUnit: string;
  childUnit: string;
  quantity: number;
};

export type InventoryCostInput = {
  purchaseUnit?: string;
  baseUnit: string;
  purchasePriceCents?: number;
  packagingLevels?: InventoryPackagingLevelForCost[];
};

/**
 * Returns the cost of one smallest usable unit, expressed in cents.
 * A null result means the item does not have a complete, usable conversion chain.
 */
export function calculateSmallestUnitCostCents(item: InventoryCostInput) {
  if (
    item.purchaseUnit === undefined ||
    item.purchasePriceCents === undefined ||
    !Number.isFinite(item.purchasePriceCents) ||
    item.purchasePriceCents < 0
  ) {
    return null;
  }

  if (item.purchaseUnit === item.baseUnit) {
    return item.purchasePriceCents;
  }

  const levelsByParent = new Map(item.packagingLevels?.map((level) => [level.parentUnit, level]) ?? []);
  const visited = new Set<string>();
  let currentUnit = item.purchaseUnit;
  let smallestUnitsPerPurchaseUnit = 1;

  while (currentUnit !== item.baseUnit) {
    if (visited.has(currentUnit)) {
      return null;
    }

    visited.add(currentUnit);
    const level = levelsByParent.get(currentUnit);

    if (!level || !Number.isInteger(level.quantity) || level.quantity < 1) {
      return null;
    }

    smallestUnitsPerPurchaseUnit *= level.quantity;

    if (!Number.isSafeInteger(smallestUnitsPerPurchaseUnit)) {
      return null;
    }

    currentUnit = level.childUnit;
  }

  if (smallestUnitsPerPurchaseUnit < 1) {
    return null;
  }

  return Number((item.purchasePriceCents / smallestUnitsPerPurchaseUnit).toFixed(6));
}
