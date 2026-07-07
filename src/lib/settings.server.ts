import { getSupabaseServerClient } from "./supabase.server";

export type Settings = {
  fondCaisse: number;
  ecartThreshold: number;
  devise: string;
  doubleValidationCoffre: boolean;
  defaultBankName: string;
  updatedByName: string;
  updatedAt: string;
};

type DbSettingsRow = {
  fond_caisse: number;
  ecart_threshold: number;
  devise: string;
  double_validation_coffre: boolean;
  default_bank_name: string;
  updated_by_name: string | null;
  updated_at: string;
};

function fromDb(row: DbSettingsRow): Settings {
  return {
    fondCaisse: row.fond_caisse,
    ecartThreshold: row.ecart_threshold,
    devise: row.devise,
    doubleValidationCoffre: row.double_validation_coffre,
    defaultBankName: row.default_bank_name,
    updatedByName: row.updated_by_name ?? "",
    updatedAt: row.updated_at,
  };
}

function settingsTable() {
  return getSupabaseServerClient() as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: number,
        ) => {
          single: () => Promise<{ data: DbSettingsRow | null; error: { message: string } | null }>;
        };
      };
      update: (row: Record<string, unknown>) => {
        eq: (column: string, value: number) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
}

export async function getSettings(): Promise<Settings> {
  const { data, error } = await settingsTable().from("backoffice_settings").select("*").eq("id", 1).single();
  if (error || !data) throw new Error(`Failed to load settings: ${error?.message ?? "not found"}`);
  return fromDb(data);
}

export async function updateSettings(input: {
  fondCaisse: number;
  ecartThreshold: number;
  devise: string;
  doubleValidationCoffre: boolean;
  defaultBankName: string;
  updatedById: string;
  updatedByName: string;
}): Promise<void> {
  const { error } = await settingsTable()
    .from("backoffice_settings")
    .update({
      fond_caisse: input.fondCaisse,
      ecart_threshold: input.ecartThreshold,
      devise: input.devise,
      double_validation_coffre: input.doubleValidationCoffre,
      default_bank_name: input.defaultBankName,
      updated_by_id: input.updatedById,
      updated_by_name: input.updatedByName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(`Failed to update settings: ${error.message}`);
}
