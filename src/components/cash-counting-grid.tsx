import { Input } from "@/components/ui/input";
import { Calculator } from "lucide-react";
import { DENOMS, ROLLS, type Denomination } from "@/lib/denominations";

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

// Shared by the CSR kiosk (/session) and the dev-only test dialog in
// Parametres, so both count denominations and rolls identically.
export function CashCountingGrid({
  counts,
  setCount,
  rolls,
  setRoll,
}: {
  counts: Record<string, number>;
  setCount: (label: string, v: string) => void;
  rolls: Record<string, number>;
  setRoll: (label: string, v: string) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
        <Calculator className="h-4 w-4" /> Comptage du tiroir
      </h3>
      <div className="grid gap-6 sm:grid-cols-2">
        <DenomList title="Billets" items={DENOMS.filter((d) => d.type === "billet")} counts={counts} setCount={setCount} />
        <DenomList title="Pièces" items={DENOMS.filter((d) => d.type === "piece")} counts={counts} setCount={setCount} />
      </div>
      <div className="mt-4">
        <h4 className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wide">Rouleaux</h4>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {ROLLS.map((r) => {
            const qty = rolls[r.label] || 0;
            return (
              <div key={r.label} className="grid grid-cols-[110px_1fr_100px] items-center gap-2 rounded-md px-2 py-1 hover:bg-accent/40">
                <span className="text-sm font-medium tabular-nums">{r.label.replace("Rouleau ", "")} <span className="text-muted-foreground font-normal">({fmt(r.value)})</span></span>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={qty || ""}
                  onChange={(e) => setRoll(r.label, e.target.value)}
                  className="h-8 tabular-nums"
                  placeholder="0"
                />
                <span className="text-sm text-right tabular-nums text-muted-foreground">{fmt(qty * r.value)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DenomList({
  title,
  items,
  counts,
  setCount,
}: {
  title: string;
  items: Denomination[];
  counts: Record<string, number>;
  setCount: (label: string, v: string) => void;
}) {
  return (
    <div>
      <h4 className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wide">{title}</h4>
      <div className="space-y-1.5">
        {items.map((d) => {
          const qty = counts[d.label] || 0;
          return (
            <div key={d.label} className="grid grid-cols-[70px_1fr_100px] items-center gap-2 rounded-md px-2 py-1 hover:bg-accent/40">
              <span className="text-sm font-medium tabular-nums">{d.label}</span>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={qty || ""}
                onChange={(e) => setCount(d.label, e.target.value)}
                className="h-8 tabular-nums"
                placeholder="0"
              />
              <span className="text-sm text-right tabular-nums text-muted-foreground">{fmt(qty * d.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
