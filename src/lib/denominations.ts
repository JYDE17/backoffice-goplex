export type Denomination = { label: string; value: number; type: "billet" | "piece" };

// Ascending order (smallest coin first, biggest bill last) - this is the
// display order everywhere counts are shown (kiosk, fermeture, reports).
export const DENOMS: Denomination[] = [
  { label: "0,05 $", value: 0.05, type: "piece" },
  { label: "0,10 $", value: 0.1, type: "piece" },
  { label: "0,25 $", value: 0.25, type: "piece" },
  { label: "1 $", value: 1, type: "piece" },
  { label: "2 $", value: 2, type: "piece" },
  { label: "5 $", value: 5, type: "billet" },
  { label: "10 $", value: 10, type: "billet" },
  { label: "20 $", value: 20, type: "billet" },
  { label: "50 $", value: 50, type: "billet" },
  { label: "100 $", value: 100, type: "billet" },
];

// Standard Canadian coin rolls. During counting a roll adds its full value
// (TellerMate-style); on save the rolls are exploded back into individual
// coins (1 roll of 0,05 $ -> 40 pieces) so stored counts and reports only
// ever contain plain denominations.
export type RollDenomination = {
  label: string;
  coinLabel: string;
  coinsPerRoll: number;
  value: number;
};

export const ROLLS: RollDenomination[] = [
  { label: "Rouleau 0,05 $", coinLabel: "0,05 $", coinsPerRoll: 40, value: 2 },
  { label: "Rouleau 0,10 $", coinLabel: "0,10 $", coinsPerRoll: 50, value: 5 },
  { label: "Rouleau 0,25 $", coinLabel: "0,25 $", coinsPerRoll: 40, value: 10 },
  { label: "Rouleau 1 $", coinLabel: "1 $", coinsPerRoll: 25, value: 25 },
  { label: "Rouleau 2 $", coinLabel: "2 $", coinsPerRoll: 25, value: 50 },
];

// The site keeps a $500 "boîte de change" (change float) on hand to make
// change, restocked from BMO on each bank deposit trip. idealQty is the
// target count per line to hold exactly $500; the deposit page uses it to
// compute how many of each are short and need to be requested from BMO.
export type ChangeBoxItem = { label: string; value: number; idealQty: number };

export const CHANGE_BOX_ITEMS: ChangeBoxItem[] = [
  { label: "5 $", value: 5, idealQty: 10 },
  { label: "Rouleau 2 $", value: 50, idealQty: 4 },
  { label: "Rouleau 1 $", value: 25, idealQty: 6 },
  { label: "Rouleau 0,25 $", value: 10, idealQty: 6 },
  { label: "Rouleau 0,10 $", value: 5, idealQty: 6 },
  { label: "Rouleau 0,05 $", value: 2, idealQty: 5 },
];

export const CHANGE_BOX_IDEAL_TOTAL = CHANGE_BOX_ITEMS.reduce(
  (sum, i) => sum + i.value * i.idealQty,
  0,
);

// The amount is derived from the denomination count (never typed freely) -
// counting bills/coins one by one is far more reliable than a lump-sum
// number, and matches how the physical "Sommaire du depot" paper form works.
export function bankDepositAmount(counts: Record<string, number>): number {
  return DENOMS.reduce((sum, d) => sum + (counts[d.label] ?? 0) * d.value, 0);
}

export function rollsTotal(rolls: Record<string, number>): number {
  return ROLLS.reduce((sum, r) => sum + (rolls[r.label] || 0) * r.value, 0);
}

export function explodeRolls(
  counts: Record<string, number>,
  rolls: Record<string, number>,
): Record<string, number> {
  const merged = { ...counts };
  for (const r of ROLLS) {
    const qty = rolls[r.label] || 0;
    if (qty > 0) merged[r.coinLabel] = (merged[r.coinLabel] || 0) + qty * r.coinsPerRoll;
  }
  return merged;
}
