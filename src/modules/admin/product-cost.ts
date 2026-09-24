export type ProductCostInput = {
  ingredientCostCents: number | null;
  laborCostCents: number;
  otherCostCents: number;
};

export function calculateProductCostCents(input: ProductCostInput) {
  if (
    input.ingredientCostCents === null ||
    !Number.isFinite(input.ingredientCostCents) ||
    !Number.isFinite(input.laborCostCents) ||
    !Number.isFinite(input.otherCostCents) ||
    input.ingredientCostCents < 0 ||
    input.laborCostCents < 0 ||
    input.otherCostCents < 0
  ) {
    return null;
  }

  return Number((input.ingredientCostCents + input.laborCostCents + input.otherCostCents).toFixed(6));
}

export type ProductMargin = {
  grossMarginCents: number | null;
  grossMarginPercent: number | null;
};

export function calculateProductMargin(sellingPriceCents: number, productCostCents: number | null): ProductMargin {
  if (
    productCostCents === null ||
    !Number.isFinite(sellingPriceCents) ||
    !Number.isFinite(productCostCents) ||
    sellingPriceCents < 0 ||
    productCostCents < 0
  ) {
    return { grossMarginCents: null, grossMarginPercent: null };
  }

  const grossMarginCents = sellingPriceCents - productCostCents;
  const grossMarginPercent = sellingPriceCents > 0
    ? Number(((grossMarginCents / sellingPriceCents) * 100).toFixed(4))
    : null;

  return { grossMarginCents, grossMarginPercent };
}
