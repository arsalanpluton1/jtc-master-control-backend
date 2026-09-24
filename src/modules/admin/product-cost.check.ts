import { calculateProductCostCents, calculateProductMargin } from "./product-cost.js";

const calculated = calculateProductCostCents({
  ingredientCostCents: 190,
  laborCostCents: 50,
  otherCostCents: 20,
});

if (calculated !== 260) {
  throw new Error(`Unexpected product cost result: ${calculated}`);
}

const incomplete = calculateProductCostCents({
  ingredientCostCents: null,
  laborCostCents: 50,
  otherCostCents: 20,
});

if (incomplete !== null) {
  throw new Error(`Incomplete product cost should be null: ${incomplete}`);
}

const margin = calculateProductMargin(500, calculated);
if (margin.grossMarginCents !== 240 || margin.grossMarginPercent !== 48) {
  throw new Error(`Unexpected product margin result: ${JSON.stringify(margin)}`);
}

const unavailableMargin = calculateProductMargin(500, null);
if (unavailableMargin.grossMarginCents !== null || unavailableMargin.grossMarginPercent !== null) {
  throw new Error(`Unavailable product cost should not produce margin: ${JSON.stringify(unavailableMargin)}`);
}

console.log("ok product cost composition, margin exposure, and incomplete-cost handling");
