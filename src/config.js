import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env");

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || "0.0.0.0",
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  openAiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  openAiTranscriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe",
  databaseUrl: process.env.DATABASE_URL || "",
  dbHost: process.env.DB_HOST || process.env.MYSQLHOST || "",
  dbPort: process.env.DB_PORT || process.env.MYSQLPORT || "3306",
  dbName: process.env.DB_NAME || process.env.MYSQLDATABASE || "",
  dbUser: process.env.DB_USER || process.env.MYSQLUSER || "",
  dbPassword: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || "",
  dbSsl: process.env.DB_SSL || "",
  dbSslRejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED || "true",
  dbSslCaPath: process.env.DB_SSL_CA_PATH || "",
  dbAutoMigrate: process.env.DB_AUTO_MIGRATE || "true"
};
