import { createServerFn } from "@tanstack/react-start";

// Signs QZ Tray requests server-side so the private key never reaches the
// browser. The key lives in qz-private-key.pem at the project root
// (gitignored) - the same file must exist on the machine hosting the app
// (POS4). If the key is missing, signing fails and QZ Tray falls back to
// per-request permission prompts instead of silent printing.
export const signQzRequestFn = createServerFn({ method: "POST" })
  .validator((data: { request: string }) => data)
  .handler(async ({ data }) => {
    const { createSign } = await import("node:crypto");
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");

    const keyPath = process.env.QZ_PRIVATE_KEY_PATH || join(process.cwd(), "qz-private-key.pem");
    let privateKey: string;
    try {
      privateKey = await readFile(keyPath, "utf8");
    } catch {
      throw new Error(`Cle privee QZ introuvable (${keyPath}). Copie qz-private-key.pem a la racine du projet sur le serveur.`);
    }

    const sign = createSign("SHA512");
    sign.update(data.request);
    return { signature: sign.sign(privateKey, "base64") };
  });
