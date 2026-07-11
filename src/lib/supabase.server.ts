import { createClient } from "@supabase/supabase-js";
import type { RaceFacerSalesSummary } from "./racefacer.server";
import type { CloverSalesReport } from "./clover.server";
import { getServerEnv } from "./env.server";

let client: ReturnType<typeof createClient> | undefined;

// Server-only Supabase client using the service role key — bypasses RLS.
// Never import this module from client-side code.
export function getSupabaseServerClient() {
  if (!client) {
    client = createClient(getServerEnv("SUPABASE_URL"), getServerEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
  }
  return client;
}

export type RaceFacerSalesRow = {
  report_date: string;
  station_id: string;
  station_name: string;
  cash_paid: number;
  cash_refund: number;
  cash_total: number;
  pos_terminal_paid: number;
  pos_terminal_refund: number;
  pos_terminal_total: number;
  bank_wire_paid: number;
  bank_wire_refund: number;
  bank_wire_total: number;
  voucher_paid: number;
  voucher_refund: number;
  voucher_total: number;
  bambora_paid: number;
  bambora_refund: number;
  bambora_total: number;
  raw_tenders: Record<string, { name: string; paid: number; refund: number; total: number }>;
  fetched_at: string;
};

function bucket(
  tenders: Record<string, { paid: number; refund: number; total: number }>,
  key: string,
) {
  return tenders[key] ?? { paid: 0, refund: 0, total: 0 };
}

// No generated Database types for this project — this narrows the client to just
// the one table we use, bypassing the PostgREST query builder's generic table
// inference (which defaults to `never` without a schema type param).
function salesReportsTable() {
  const db = getSupabaseServerClient() as unknown as {
    from: (table: string) => {
      upsert: (
        rows: RaceFacerSalesRow[],
        opts: { onConflict: string },
      ) => Promise<{ error: { message: string } | null }>;
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => Promise<{ data: RaceFacerSalesRow[] | null; error: { message: string } | null }>;
      };
    };
  };
  return db.from("backoffice_racefacer_sales_reports");
}

export async function upsertRaceFacerSales(reportDate: string, summary: RaceFacerSalesSummary) {
  const fetchedAt = new Date().toISOString();

  const rows = summary.stations.map((station) => {
    const cash = bucket(station.tenders, "cash");
    const posTerminal = bucket(station.tenders, "pos-terminal");
    const bankWire = bucket(station.tenders, "bank-wire");
    const voucher = bucket(station.tenders, "voucher");
    const bambora = bucket(station.tenders, "bambora");

    return {
      report_date: reportDate,
      station_id: station.stationId,
      station_name: station.stationName,
      cash_paid: cash.paid,
      cash_refund: cash.refund,
      cash_total: cash.total,
      pos_terminal_paid: posTerminal.paid,
      pos_terminal_refund: posTerminal.refund,
      pos_terminal_total: posTerminal.total,
      bank_wire_paid: bankWire.paid,
      bank_wire_refund: bankWire.refund,
      bank_wire_total: bankWire.total,
      voucher_paid: voucher.paid,
      voucher_refund: voucher.refund,
      voucher_total: voucher.total,
      bambora_paid: bambora.paid,
      bambora_refund: bambora.refund,
      bambora_total: bambora.total,
      raw_tenders: station.tenders,
      fetched_at: fetchedAt,
    };
  });

  const { error } = await salesReportsTable().upsert(rows, {
    onConflict: "report_date,station_id",
  });

  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);

  return rows as RaceFacerSalesRow[];
}

export async function getStoredRaceFacerSales(reportDate: string) {
  const { data, error } = await salesReportsTable().select("*").eq("report_date", reportDate);

  if (error) throw new Error(`Supabase read failed: ${error.message}`);

  return (data ?? []) as unknown as RaceFacerSalesRow[];
}

export type CloverSalesRow = {
  report_date: string;
  station_name: string;
  device_id: string;
  paid_total: number;
  payment_count: number;
  fetched_at: string;
};

function cloverSalesReportsTable() {
  const db = getSupabaseServerClient() as unknown as {
    from: (table: string) => {
      upsert: (
        rows: CloverSalesRow[],
        opts: { onConflict: string },
      ) => Promise<{ error: { message: string } | null }>;
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => Promise<{ data: CloverSalesRow[] | null; error: { message: string } | null }>;
      };
    };
  };
  return db.from("backoffice_clover_sales_reports");
}

// Only devices present in CLOVER_DEVICE_POS_MAP get stored/matched to a POS;
// anything else is returned as `unmatchedDeviceIds` so the caller can surface
// a "new/unknown terminal" warning instead of silently dropping its sales.
export async function upsertCloverSales(reportDate: string, report: CloverSalesReport) {
  const { posNameForDevice } = await import("./clover-terminals");
  const fetchedAt = new Date().toISOString();
  const unmatchedDeviceIds: string[] = [];

  const rows: CloverSalesRow[] = [];
  for (const device of report.devices) {
    const stationName = posNameForDevice(device.deviceId);
    if (!stationName) {
      unmatchedDeviceIds.push(device.deviceId);
      continue;
    }
    rows.push({
      report_date: reportDate,
      station_name: stationName,
      device_id: device.deviceId,
      paid_total: device.paidTotal,
      payment_count: device.count,
      fetched_at: fetchedAt,
    });
  }

  if (rows.length > 0) {
    const { error } = await cloverSalesReportsTable().upsert(rows, {
      onConflict: "report_date,station_name",
    });
    if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
  }

  return { rows, unmatchedDeviceIds };
}

export async function getStoredCloverSales(reportDate: string) {
  const { data, error } = await cloverSalesReportsTable().select("*").eq("report_date", reportDate);

  if (error) throw new Error(`Supabase read failed: ${error.message}`);

  return (data ?? []) as unknown as CloverSalesRow[];
}
