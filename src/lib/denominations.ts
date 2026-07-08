export type Denomination = { label: string; value: number; type: "billet" | "piece" };

export const DENOMS: Denomination[] = [
  { label: "100 $", value: 100, type: "billet" },
  { label: "50 $", value: 50, type: "billet" },
  { label: "20 $", value: 20, type: "billet" },
  { label: "10 $", value: 10, type: "billet" },
  { label: "5 $", value: 5, type: "billet" },
  { label: "2 $", value: 2, type: "piece" },
  { label: "1 $", value: 1, type: "piece" },
  { label: "0,25 $", value: 0.25, type: "piece" },
  { label: "0,10 $", value: 0.1, type: "piece" },
  { label: "0,05 $", value: 0.05, type: "piece" },
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
  { label: "Rouleau 2 $", coinLabel: "2 $", coinsPerRoll: 25, value: 50 },
  { label: "Rouleau 1 $", coinLabel: "1 $", coinsPerRoll: 25, value: 25 },
  { label: "Rouleau 0,25 $", coinLabel: "0,25 $", coinsPerRoll: 40, value: 10 },
  { label: "Rouleau 0,10 $", coinLabel: "0,10 $", coinsPerRoll: 50, value: 5 },
  { label: "Rouleau 0,05 $", coinLabel: "0,05 $", coinsPerRoll: 40, value: 2 },
];

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
