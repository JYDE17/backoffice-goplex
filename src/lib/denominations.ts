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
