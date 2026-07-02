import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { config } from "./config.js";

let poolPromise = null;

function toBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function resolveSslConfig() {
  if (!toBoolean(config.dbSsl, false)) {
    return undefined;
  }

  const sslConfig = {
    rejectUnauthorized: toBoolean(config.dbSslRejectUnauthorized, true)
  };

  if (config.dbSslCaPath) {
    sslConfig.ca = fs.readFileSync(config.dbSslCaPath, "utf8");
  }

  return sslConfig;
}

function buildConnectionOptions() {
  const ssl = resolveSslConfig();

  if (config.databaseUrl) {
    const url = new URL(config.databaseUrl);
    return {
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ""),
      ssl,
      connectTimeout: 10_000,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };
  }

  if (!config.dbHost || !config.dbName || !config.dbUser) {
    throw new Error("Configuration MySQL manquante");
  }

  return {
    host: config.dbHost,
    port: Number(config.dbPort || 3306),
    user: config.dbUser,
    password: config.dbPassword || "",
    database: config.dbName,
    ssl,
    connectTimeout: 10_000,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };
}

export function isDatabaseConfigured() {
  return Boolean(
    config.databaseUrl || (config.dbHost && config.dbName && config.dbUser)
  );
}

export async function getDbPool() {
  if (!poolPromise) {
    const options = buildConnectionOptions();
    poolPromise = mysql.createPool(options);
  }

  return poolPromise;
}

export async function testDatabaseConnection() {
  const pool = await getDbPool();
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

export async function bootstrapDatabase() {
  if (!isDatabaseConfigured() || !toBoolean(config.dbAutoMigrate, true)) {
    return;
  }

  const pool = await getDbPool();
  const schemaPath = path.resolve(process.cwd(), "sql", "schema.sql");
  const schemaContent = fs.readFileSync(schemaPath, "utf8");
  const statements = schemaContent
    .split(/;\s*\n/g)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await pool.query(statement);
  }
}
