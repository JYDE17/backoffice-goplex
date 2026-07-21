// Most real-world "débalancements" reported by staff turn out to be a
// payment taken on one Clover terminal but logged against a different
// station's fermeture (e.g. paid on Clover 5, entered under POS 1). That
// shows up as a matching PAIR of opposite écarts on the same day: the
// station that's missing the money has a negative ecart_pos, and the one
// that got credited for it has a positive ecart_pos of about the same size -
// unlike an unrelated counting mistake, which has no reason to be mirrored
// on another station.
export type PosSwapAlert = {
  date: string;
  stationA: string;
  stationB: string;
  amount: number;
};

// Ignore rounding/counting noise under $1 - same threshold already used for
// "this écart is worth flagging" elsewhere (see ECART_ALERT_THRESHOLD in
// report-format.ts).
const SWAP_MIN_AMOUNT = 1;
// How close the two écarts have to be to call them a match - a real swap of
// a single payment nets to ~0 exactly, this just allows for an unrelated
// few-cents rounding difference layered on top.
const SWAP_MATCH_TOLERANCE = 0.5;

export async function detectPosSwaps(sinceDate: string, isTest: boolean): Promise<PosSwapAlert[]> {
  const { listClosures } = await import("./closures.server");
  const closures = await listClosures({ since: sinceDate, isTest });

  // Sum ecart_pos per (date, station) - a station can close more than once a
  // day (shift changes), and a swapped payment nets out the same way across
  // however many shifts it's spread over.
  const byDate = new Map<string, Map<string, number>>();
  for (const c of closures) {
    if (!byDate.has(c.closureDate)) byDate.set(c.closureDate, new Map());
    const byStation = byDate.get(c.closureDate)!;
    byStation.set(c.stationName, (byStation.get(c.stationName) ?? 0) + c.ecartPos);
  }

  const alerts: PosSwapAlert[] = [];
  for (const [date, byStation] of byDate) {
    const stations = [...byStation.entries()].filter(
      ([, ecart]) => Math.abs(ecart) >= SWAP_MIN_AMOUNT,
    );
    for (let i = 0; i < stations.length; i++) {
      for (let j = i + 1; j < stations.length; j++) {
        const [stationA, ecartA] = stations[i];
        const [stationB, ecartB] = stations[j];
        if (ecartA * ecartB < 0 && Math.abs(ecartA + ecartB) <= SWAP_MATCH_TOLERANCE) {
          alerts.push({
            date,
            stationA,
            stationB,
            amount: (Math.abs(ecartA) + Math.abs(ecartB)) / 2,
          });
        }
      }
    }
  }

  return alerts.sort((a, b) => b.date.localeCompare(a.date));
}
