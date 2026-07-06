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
  openAiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large",
  cartesiaApiKey: process.env.CARTESIA_API_KEY || "",
  cartesiaModelId: process.env.CARTESIA_MODEL_ID || "sonic-3.5",
  cartesiaVersion: process.env.CARTESIA_VERSION || "2026-03-01",
  cartesiaVoiceIds: {
    fr: process.env.CARTESIA_VOICE_ID_FR || "",
    en: process.env.CARTESIA_VOICE_ID_EN || "",
    es: process.env.CARTESIA_VOICE_ID_ES || "",
    ru: process.env.CARTESIA_VOICE_ID_RU || "",
    zh: process.env.CARTESIA_VOICE_ID_ZH || "",
    ar: process.env.CARTESIA_VOICE_ID_AR || ""
  },
  databaseUrl: process.env.DATABASE_URL || "",
  dbHost: process.env.DB_HOST || process.env.MYSQLHOST || "",
  dbPort: process.env.DB_PORT || process.env.MYSQLPORT || "3306",
  dbName: process.env.DB_NAME || process.env.MYSQLDATABASE || "",
  dbUser: process.env.DB_USER || process.env.MYSQLUSER || "",
  dbPassword: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || "",
  dbSsl: process.env.DB_SSL || "",
  dbSslRejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED || "true",
  dbSslCaPath: process.env.DB_SSL_CA_PATH || "",
  dbAutoMigrate: process.env.DB_AUTO_MIGRATE || "true",
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || "",
  cloudinaryFolder: process.env.CLOUDINARY_FOLDER || "products"
};
