// Server-only client for the Clover REST API (api.clover.com) — fetches
// payment totals per physical terminal (device) for a given day, so they can
// be matched to the right POS station via clover-terminals.ts. Unlike
// RaceFacer, Clover is cloud-hosted — no local network restriction.
import { getServerEnv } from "./env.server";
import { getUtcDayRange } from "./dates";

export type CloverDevice = {
  id: string;
  name?: string;
  serial?: string;
  model?: string;
};

export type CloverDeviceSales = {
  deviceId: string;
  paidTotal: number;
  refundTotal: number;
  count: number;
};

export type CloverSalesReport = {
  reportDate: string;
  devices: CloverDeviceSales[];
};

const VENUE_TIME_ZONE = "America/Toronto";

// Midnight-to-midnight, matching both Clover's own on-screen report AND
// RaceFacer's report (which only ever takes a date, not a time, and can't be
// shifted). This has to match RaceFacer's window exactly or the Écart POS
// comparison becomes meaningless: a payment or refund made between midnight
// and the 4h batch cutoff would be included on one side and not the other,
// producing a phantom écart for money that was never actually missing.
// (A prior version shifted this to 4h-to-4h to solve a real problem - a
// refund at 00h04 attributed to the wrong business day for OUR OWN closure
// bookkeeping - but that broke parity with RaceFacer, which has no
// equivalent shift available. If Clover's own report-generation time moves
// to 4h (the merchant is evaluating this), revisit only once RaceFacer's
// day boundary can also be confirmed to move with it.)
function dayRangeMs(isoDate: string): { start: number; end: number } {
  return getUtcDayRange(isoDate, VENUE_TIME_ZONE);
}

function cloverConfig() {
  return {
    baseUrl: getServerEnv("CLOVER_API_BASE_URL").replace(/\/$/, ""),
    merchantId: getServerEnv("CLOVER_MERCHANT_ID"),
    token: getServerEnv("CLOVER_API_TOKEN"),
  };
}

function cloverHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

export async function fetchCloverDevices(): Promise<CloverDevice[]> {
  const { baseUrl, merchantId, token } = cloverConfig();

  const res = await fetch(`${baseUrl}/v3/merchants/${merchantId}/devices`, {
    headers: cloverHeaders(token),
  });
  if (!res.ok) {
    throw new Error(`Clover devices request failed with status ${res.status}.`);
  }
  const json = (await res.json()) as { elements?: CloverDevice[] };
  return json.elements ?? [];
}

async function paginate<T>(
  url: URL,
  token: string,
  onPage: (elements: T[]) => void,
): Promise<void> {
  const limit = 100;
  let offset = 0;
  for (;;) {
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const res = await fetch(url, { headers: cloverHeaders(token) });
    if (!res.ok) {
      throw new Error(`Clover request to ${url.pathname} failed with status ${res.status}.`);
    }
    const json = (await res.json()) as { elements?: T[] };
    const elements = json.elements ?? [];
    onPage(elements);

    if (elements.length < limit) break;
    offset += limit;
  }
}

export async function fetchCloverSalesByDevice(isoDate: string): Promise<CloverSalesReport> {
  const { baseUrl, merchantId, token } = cloverConfig();
  const { start, end } = dayRangeMs(isoDate);

  const totals = new Map<string, { paidTotal: number; refundTotal: number; count: number }>();
  const entryFor = (deviceId: string) => {
    let entry = totals.get(deviceId);
    if (!entry) {
      entry = { paidTotal: 0, refundTotal: 0, count: 0 };
      totals.set(deviceId, entry);
    }
    return entry;
  };

  const paymentsUrl = new URL(`${baseUrl}/v3/merchants/${merchantId}/payments`);
  paymentsUrl.searchParams.append("filter", `createdTime>=${start}`);
  paymentsUrl.searchParams.append("filter", `createdTime<${end}`);
  paymentsUrl.searchParams.set("expand", "device");
  await paginate<{ amount: number; device?: { id: string }; result?: string }>(
    paymentsUrl,
    token,
    (elements) => {
      for (const payment of elements) {
        if (payment.result && payment.result !== "SUCCESS") continue;
        const deviceId = payment.device?.id;
        if (!deviceId) continue;
        const entry = entryFor(deviceId);
        entry.paidTotal += payment.amount / 100;
        entry.count += 1;
      }
    },
  );

  // Refunds tied to an existing payment are their own resource, keyed by the
  // refund's own createdTime (not the original payment's) - a refund issued
  // today for a payment made yesterday still counts against today.
  // Attributed to the device that processed the original payment via the
  // nested payment.device expand.
  const refundsUrl = new URL(`${baseUrl}/v3/merchants/${merchantId}/refunds`);
  refundsUrl.searchParams.append("filter", `createdTime>=${start}`);
  refundsUrl.searchParams.append("filter", `createdTime<${end}`);
  refundsUrl.searchParams.set("expand", "payment.device");
  await paginate<{ amount: number; payment?: { device?: { id: string } } }>(
    refundsUrl,
    token,
    (elements) => {
      for (const refund of elements) {
        const deviceId = refund.payment?.device?.id;
        if (!deviceId) continue;
        entryFor(deviceId).refundTotal += refund.amount / 100;
      }
    },
  );

  // "Manual Refund" in Clover's own UI is a DIFFERENT resource: a Credit -
  // a refund NOT tied to any existing payment (e.g. an employee crediting
  // back an overcharge from the terminal itself). It carries `device`
  // directly, no nesting through a payment. Confirmed against a real 25$
  // manual refund on 2026-07-11: GET .../credits returned
  // { amount: 2500, device: { id: "..." }, voided: false, result: "SUCCESS" }
  // with no `payment` reference at all - the old /refunds-only fetch always
  // returned zero for this merchant because every refund they do is this
  // manual/standalone kind.
  const creditsUrl = new URL(`${baseUrl}/v3/merchants/${merchantId}/credits`);
  creditsUrl.searchParams.append("filter", `createdTime>=${start}`);
  creditsUrl.searchParams.append("filter", `createdTime<${end}`);
  creditsUrl.searchParams.set("expand", "device");
  await paginate<{ amount: number; device?: { id: string }; voided?: boolean; result?: string }>(
    creditsUrl,
    token,
    (elements) => {
      for (const credit of elements) {
        if (credit.voided) continue;
        if (credit.result && credit.result !== "SUCCESS") continue;
        const deviceId = credit.device?.id;
        if (!deviceId) continue;
        entryFor(deviceId).refundTotal += credit.amount / 100;
      }
    },
  );

  const devices: CloverDeviceSales[] = [...totals.entries()].map(([deviceId, v]) => ({
    deviceId,
    paidTotal: v.paidTotal,
    refundTotal: v.refundTotal,
    count: v.count,
  }));

  return { reportDate: isoDate, devices };
}
