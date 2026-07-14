import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localDateString } from "@/lib/dates";

// Manual "du/au" range entry with quick presets, matching the style of
// Véloce's own native reports (Today/Yesterday/Last 7 days/This month/
// Last month/Custom) rather than forcing a single-month picker.
export function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}) {
  const today = localDateString();

  const setDaysBack = (daysBack: number) => {
    const start = new Date();
    start.setDate(start.getDate() - daysBack);
    onChange({ from: localDateString(start), to: today });
  };

  const setYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const s = localDateString(d);
    onChange({ from: s, to: s });
  };

  const setThisMonth = () => {
    const d = new Date();
    onChange({ from: localDateString(new Date(d.getFullYear(), d.getMonth(), 1)), to: today });
  };

  const setLastMonth = () => {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const end = new Date(d.getFullYear(), d.getMonth(), 0);
    onChange({ from: localDateString(start), to: localDateString(end) });
  };

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <Label className="mb-1 block">Du</Label>
        <Input
          type="date"
          value={from}
          max={to}
          onChange={(e) => onChange({ from: e.target.value, to })}
          className="w-40"
        />
      </div>
      <div>
        <Label className="mb-1 block">Au</Label>
        <Input
          type="date"
          value={to}
          min={from}
          max={today}
          onChange={(e) => onChange({ from, to: e.target.value })}
          className="w-40"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange({ from: today, to: today })}
        >
          Aujourd'hui
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={setYesterday}>
          Hier
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setDaysBack(6)}>
          7 derniers jours
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setDaysBack(29)}>
          30 derniers jours
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={setThisMonth}>
          Ce mois-ci
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={setLastMonth}>
          Mois dernier
        </Button>
      </div>
    </div>
  );
}
