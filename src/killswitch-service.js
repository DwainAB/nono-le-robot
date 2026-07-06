import { getDbPool, isDatabaseConfigured } from "./db.js";

export async function getKillswitchState() {
  if (!isDatabaseConfigured()) {
    return { enabled: false };
  }

  const pool = await getDbPool();
  const [rows] = await pool.query(
    "SELECT killswitch_enabled FROM app_settings WHERE id = 1 LIMIT 1"
  );

  if (!rows.length) {
    return { enabled: false };
  }

  return { enabled: Boolean(rows[0].killswitch_enabled) };
}

export async function setKillswitchState(enabled) {
  if (!isDatabaseConfigured()) {
    throw new Error("Base de donnees non configuree");
  }

  const pool = await getDbPool();
  await pool.query(
    `INSERT INTO app_settings (id, killswitch_enabled)
     VALUES (1, ?)
     ON DUPLICATE KEY UPDATE killswitch_enabled = VALUES(killswitch_enabled)`,
    [enabled ? 1 : 0]
  );

  return getKillswitchState();
}
