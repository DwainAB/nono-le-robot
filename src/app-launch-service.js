import { getDbPool, isDatabaseConfigured } from "./db.js";

export async function recordAppLaunch(ipAddress) {
  const cleanedIpAddress = String(ipAddress || "").trim();
  if (!cleanedIpAddress) {
    throw new Error("Adresse IP manquante");
  }

  if (!isDatabaseConfigured()) {
    throw new Error("Base de donnees non configuree");
  }

  const pool = await getDbPool();
  await pool.query(
    "INSERT INTO app_launches (ip_address) VALUES (?)",
    [cleanedIpAddress]
  );

  return { ipAddress: cleanedIpAddress };
}
