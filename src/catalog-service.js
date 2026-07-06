import { getDbPool, isDatabaseConfigured } from "./db.js";

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

function deduplicateStrings(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      continue;
    }

    const normalized = normalize(trimmed);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(trimmed);
  }

  return result;
}

function cleanNullableText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed || null;
}

function normalizeLanguageCode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith("fr")) return "fr";
  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("zh")) return "zh";
  if (normalized.startsWith("ar")) return "ar";
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("ru")) return "ru";
  return normalized;
}

function cleanTranslationsMap(translationsInput, mapper) {
  const entries = Object.entries(translationsInput || {})
    .map(([languageCode, value]) => {
      const normalizedLanguageCode = normalizeLanguageCode(languageCode);
      if (!normalizedLanguageCode || !value || typeof value !== "object") {
        return null;
      }

      const mappedValue = mapper(value);
      const hasContent = Object.values(mappedValue).some(Boolean);
      if (!hasContent) {
        return null;
      }

      return [normalizedLanguageCode, mappedValue];
    })
    .filter(Boolean);

  return Object.fromEntries(entries);
}

function toBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function scoreCandidate(normalizedMessage, candidate) {
  const normalizedCandidate = normalize(candidate);
  if (!normalizedMessage || !normalizedCandidate) {
    return 0;
  }

  const singularMessage = normalizedMessage.endsWith("s") ? normalizedMessage.slice(0, -1) : normalizedMessage;
  const singularCandidate = normalizedCandidate.endsWith("s") ? normalizedCandidate.slice(0, -1) : normalizedCandidate;

  if (normalizedMessage === normalizedCandidate) {
    return 1000 + normalizedCandidate.length;
  }

  if (singularMessage && singularCandidate && singularMessage === singularCandidate) {
    return 950 + singularCandidate.length;
  }

  if (normalizedMessage.includes(normalizedCandidate)) {
    return 700 + normalizedCandidate.length;
  }

  if (normalizedMessage.includes(singularCandidate) || singularMessage.includes(normalizedCandidate)) {
    return 680 + singularCandidate.length;
  }

  if (normalizedCandidate.includes(normalizedMessage)) {
    return 500 + normalizedMessage.length;
  }

  if (singularCandidate.includes(singularMessage) || singularMessage.includes(singularCandidate)) {
    return 480 + singularMessage.length;
  }

  const messageWords = normalizedMessage.split(" ");
  if (messageWords.includes(normalizedCandidate)) {
    return 600 + normalizedCandidate.length;
  }

  return 0;
}

function mapProductRow(row) {
  return {
    id: String(row.id),
    slug: row.slug,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    price: row.price === null || row.price === undefined ? null : Number(row.price),
    currency: row.currency,
    isActive: Boolean(row.is_active),
    labels: {},
    aliases: [],
    catalogs: []
  };
}

function mapCatalogRow(row) {
  return {
    id: String(row.id),
    slug: row.slug,
    name: row.name,
    description: row.description,
    isActive: Boolean(row.is_active),
    labels: {},
    aliases: [],
    products: [],
    locations: []
  };
}

async function fetchCatalogFullSnapshot() {
  if (!isDatabaseConfigured()) {
    return { catalogs: [], products: [] };
  }

  const pool = await getDbPool();

  const [catalogRows] = await pool.query(
    `SELECT * FROM catalogs WHERE is_active = 1 ORDER BY name ASC`
  );
  const [productRows] = await pool.query(
    `SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC`
  );
  const [catalogAliasRows] = await pool.query(
    `SELECT catalog_id, alias FROM catalog_aliases WHERE is_active = 1`
  );
  const [productAliasRows] = await pool.query(
    `SELECT product_id, alias FROM product_aliases WHERE is_active = 1`
  );
  const [catalogTranslationRows] = await pool.query(
    `SELECT catalog_id, language_code, name, description FROM catalog_translations`
  );
  const [productTranslationRows] = await pool.query(
    `SELECT product_id, language_code, name, description FROM product_translations`
  );
  const [catalogProductRows] = await pool.query(
    `SELECT cp.catalog_id, cp.product_id, cp.priority
     FROM catalog_products cp
     INNER JOIN products p ON p.id = cp.product_id AND p.is_active = 1
     WHERE cp.is_active = 1
     ORDER BY cp.priority ASC`
  );
  const [catalogLocationRows] = await pool.query(
    `SELECT
       cl.catalog_id,
       cl.location_id,
       cl.priority,
       cl.notes,
       l.slug AS location_slug,
       l.external_robot_id AS location_external_robot_id,
       l.name AS location_name,
       l.zone AS location_zone,
       l.details AS location_details,
       l.floor_label AS location_floor_label,
       l.description AS location_description,
       l.robot_can_navigate AS location_robot_can_navigate,
       l.is_currently_available AS location_is_currently_available
     FROM catalog_locations cl
     INNER JOIN locations l ON l.id = cl.location_id AND l.is_active = 1
     WHERE cl.is_active = 1
     ORDER BY cl.priority ASC`
  );

  const catalogs = catalogRows.map(mapCatalogRow);
  const catalogsById = new Map(catalogs.map((catalog) => [Number(catalog.id), catalog]));
  const products = productRows.map(mapProductRow);
  const productsById = new Map(products.map((product) => [Number(product.id), product]));

  for (const row of catalogAliasRows) {
    const catalog = catalogsById.get(Number(row.catalog_id));
    if (catalog) catalog.aliases.push(row.alias);
  }

  for (const row of productAliasRows) {
    const product = productsById.get(Number(row.product_id));
    if (product) product.aliases.push(row.alias);
  }

  for (const row of catalogTranslationRows) {
    const catalog = catalogsById.get(Number(row.catalog_id));
    const languageCode = normalizeLanguageCode(row.language_code);
    if (!catalog || !languageCode) continue;
    catalog.labels[languageCode] = {
      name: cleanNullableText(row.name),
      description: cleanNullableText(row.description)
    };
  }

  for (const row of productTranslationRows) {
    const product = productsById.get(Number(row.product_id));
    const languageCode = normalizeLanguageCode(row.language_code);
    if (!product || !languageCode) continue;
    product.labels[languageCode] = {
      name: cleanNullableText(row.name),
      description: cleanNullableText(row.description)
    };
  }

  for (const row of catalogProductRows) {
    const catalog = catalogsById.get(Number(row.catalog_id));
    const product = productsById.get(Number(row.product_id));
    if (!catalog || !product) continue;
    catalog.products.push({ ...product, priority: row.priority });
    product.catalogs.push({
      id: catalog.id,
      slug: catalog.slug,
      name: catalog.name,
      priority: row.priority
    });
  }

  for (const row of catalogLocationRows) {
    const catalog = catalogsById.get(Number(row.catalog_id));
    if (!catalog) continue;
    catalog.locations.push({
      id: String(row.location_id),
      slug: row.location_slug,
      externalRobotId: row.location_external_robot_id,
      name: row.location_name,
      zone: row.location_zone,
      details: row.location_details,
      floorLabel: row.location_floor_label,
      description: row.location_description,
      robotCanNavigate: Boolean(row.location_robot_can_navigate),
      isCurrentlyAvailable: Boolean(row.location_is_currently_available),
      priority: row.priority,
      notes: row.notes
    });
  }

  for (const catalog of catalogs) {
    catalog.aliases = deduplicateStrings(catalog.aliases);
    catalog.locations.sort((left, right) => left.priority - right.priority);
  }
  for (const product of products) {
    product.aliases = deduplicateStrings(product.aliases);
  }

  return { catalogs, products };
}

export async function listCatalogs() {
  const snapshot = await fetchCatalogFullSnapshot();
  return snapshot.catalogs;
}

export async function listProducts() {
  const snapshot = await fetchCatalogFullSnapshot();
  return snapshot.products;
}

function chooseBestCatalogLocation(catalog) {
  const ordered = (catalog.locations || [])
    .slice()
    .sort((left, right) => {
      if (left.robotCanNavigate !== right.robotCanNavigate) {
        return Number(right.robotCanNavigate) - Number(left.robotCanNavigate);
      }
      if (left.isCurrentlyAvailable !== right.isCurrentlyAvailable) {
        return Number(right.isCurrentlyAvailable) - Number(left.isCurrentlyAvailable);
      }
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }
      return left.name.localeCompare(right.name, "fr");
    });

  return ordered[0] || null;
}

export async function findProductFromMessage(message, { limit = 5 } = {}) {
  const normalizedMessage = normalize(message);
  if (!normalizedMessage) {
    return [];
  }

  const snapshot = await fetchCatalogFullSnapshot();
  const scored = [];

  for (const product of snapshot.products) {
    const candidates = [
      product.name,
      product.slug,
      product.description,
      ...Object.values(product.labels || {}).flatMap((label) => [label?.name, label?.description]),
      ...product.aliases,
      ...product.catalogs.flatMap((catalog) => [catalog.name])
    ];

    let bestScore = 0;
    for (const candidate of candidates) {
      const score = scoreCandidate(normalizedMessage, candidate);
      if (score > bestScore) bestScore = score;
    }

    if (bestScore > 0) {
      const bestCatalog = product.catalogs
        .map((catalogRef) => snapshot.catalogs.find((catalog) => catalog.id === catalogRef.id))
        .filter(Boolean)
        .sort((left, right) => (left.products.find((p) => p.id === product.id)?.priority || 0) - (right.products.find((p) => p.id === product.id)?.priority || 0))[0] || null;

      scored.push({
        product,
        catalog: bestCatalog,
        location: bestCatalog ? chooseBestCatalogLocation(bestCatalog) : null,
        score: bestScore
      });
    }
  }

  return scored
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export async function findCatalogFromMessage(message) {
  const normalizedMessage = normalize(message);
  if (!normalizedMessage) {
    return null;
  }

  const snapshot = await fetchCatalogFullSnapshot();
  let best = null;
  let bestScore = 0;

  for (const catalog of snapshot.catalogs) {
    const candidates = [
      catalog.name,
      catalog.slug,
      catalog.description,
      ...Object.values(catalog.labels || {}).flatMap((label) => [label?.name, label?.description]),
      ...catalog.aliases
    ];

    for (const candidate of candidates) {
      const score = scoreCandidate(normalizedMessage, candidate);
      if (score > bestScore) {
        bestScore = score;
        best = catalog;
      }
    }
  }

  if (!best) {
    return null;
  }

  return {
    catalog: best,
    location: chooseBestCatalogLocation(best)
  };
}

export async function buildCatalogContextText(language = "fr") {
  const snapshot = await fetchCatalogFullSnapshot();
  return snapshot.catalogs
    .map((catalog) => {
      const localizedName = catalog.labels?.[language]?.name || catalog.name;
      const localizedDescription = catalog.labels?.[language]?.description || catalog.description;
      const locationNames = catalog.locations.map((location) => location.name).join(", ") || "lieu non renseigne";
      const productNames = catalog.products
        .map((product) => product.labels?.[language]?.name || product.name)
        .join(", ");

      return `${localizedName}${localizedDescription ? ` (${localizedDescription})` : ""}: disponible a ${locationNames}.${
        productNames ? ` produits: ${productNames}` : ""
      }`;
    })
    .join(" ; ");
}

export async function upsertCatalog(catalogInput) {
  if (!isDatabaseConfigured()) {
    throw new Error("Base de donnees non configuree");
  }

  const name = String(catalogInput?.name || "").trim();
  if (!name) {
    throw new Error("Nom de catalogue manquant");
  }

  const slug = String(catalogInput.slug || slugify(name)).trim();
  const description = catalogInput.description ? String(catalogInput.description).trim() : null;
  const aliases = deduplicateStrings(Array.isArray(catalogInput.aliases) ? catalogInput.aliases : []);
  const translations = cleanTranslationsMap(catalogInput.translations, (value) => ({
    name: cleanNullableText(value.name),
    description: cleanNullableText(value.description)
  }));

  const pool = await getDbPool();
  const [existingRows] = await pool.query(
    `SELECT * FROM catalogs WHERE id = ? OR slug = ? LIMIT 1`,
    [Number(catalogInput.id || 0), slug]
  );

  let catalogId;

  if (existingRows.length) {
    await pool.query(
      `UPDATE catalogs
       SET slug = ?, name = ?, description = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [slug, name, description, existingRows[0].id]
    );
    catalogId = Number(existingRows[0].id);
  } else {
    const [insertResult] = await pool.query(
      `INSERT INTO catalogs (slug, name, description) VALUES (?, ?, ?)`,
      [slug, name, description]
    );
    catalogId = Number(insertResult.insertId);
  }

  await pool.query("DELETE FROM catalog_aliases WHERE catalog_id = ?", [catalogId]);
  for (const alias of aliases) {
    await pool.query(`INSERT INTO catalog_aliases (catalog_id, alias) VALUES (?, ?)`, [catalogId, alias]);
  }

  await pool.query("DELETE FROM catalog_translations WHERE catalog_id = ?", [catalogId]);
  for (const [languageCode, translation] of Object.entries(translations)) {
    await pool.query(
      `INSERT INTO catalog_translations (catalog_id, language_code, name, description) VALUES (?, ?, ?, ?)`,
      [catalogId, languageCode, translation.name, translation.description]
    );
  }

  const [rows] = await pool.query("SELECT * FROM catalogs WHERE id = ? LIMIT 1", [catalogId]);
  return mapCatalogRow(rows[0]);
}

export async function replaceCatalogLocations(catalogId, locationLinks) {
  if (!isDatabaseConfigured()) {
    throw new Error("Base de donnees non configuree");
  }

  const numericCatalogId = Number(catalogId);
  if (!numericCatalogId) {
    throw new Error("catalogId invalide");
  }

  const pool = await getDbPool();
  const [catalogRows] = await pool.query(
    "SELECT id FROM catalogs WHERE id = ? AND is_active = 1 LIMIT 1",
    [numericCatalogId]
  );
  if (!catalogRows.length) {
    throw new Error("Catalogue introuvable");
  }

  await pool.query("DELETE FROM catalog_locations WHERE catalog_id = ?", [numericCatalogId]);

  const links = Array.isArray(locationLinks) ? locationLinks : [];
  for (let index = 0; index < links.length; index += 1) {
    const link = links[index];
    const locationId = Number(link.locationId || link.id);
    if (!locationId) continue;

    const [locationRows] = await pool.query(
      "SELECT id FROM locations WHERE id = ? AND is_active = 1 LIMIT 1",
      [locationId]
    );
    if (!locationRows.length) continue;

    await pool.query(
      `INSERT INTO catalog_locations (catalog_id, location_id, priority, notes)
       VALUES (?, ?, ?, ?)`,
      [
        numericCatalogId,
        locationId,
        Number(link.priority || (index + 1) * 10),
        link.notes ? String(link.notes).trim() : null
      ]
    );
  }

  return listCatalogs();
}

async function upsertProductRecord(pool, productInput) {
  const name = String(productInput?.name || "").trim();
  if (!name) {
    throw new Error("Nom de produit manquant");
  }

  const slug = String(productInput.slug || slugify(name)).trim();
  const description = productInput.description ? String(productInput.description).trim() : null;
  const imageUrl = productInput.imageUrl ? String(productInput.imageUrl).trim() : null;
  const price =
    productInput.price === undefined || productInput.price === null || productInput.price === ""
      ? null
      : Number(productInput.price);
  const currency = String(productInput.currency || "EUR").trim().toUpperCase().slice(0, 3) || "EUR";
  const aliases = deduplicateStrings(Array.isArray(productInput.aliases) ? productInput.aliases : []);
  const translations = cleanTranslationsMap(productInput.translations, (value) => ({
    name: cleanNullableText(value.name),
    description: cleanNullableText(value.description)
  }));

  if (price !== null && !Number.isFinite(price)) {
    throw new Error("Prix invalide");
  }

  const [existingRows] = await pool.query(
    `SELECT * FROM products WHERE id = ? OR slug = ? LIMIT 1`,
    [Number(productInput.id || 0), slug]
  );

  let productId;

  if (existingRows.length) {
    await pool.query(
      `UPDATE products
       SET slug = ?, name = ?, description = ?, image_url = ?, price = ?, currency = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [slug, name, description, imageUrl, price, currency, existingRows[0].id]
    );
    productId = Number(existingRows[0].id);
  } else {
    const [insertResult] = await pool.query(
      `INSERT INTO products (slug, name, description, image_url, price, currency)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [slug, name, description, imageUrl, price, currency]
    );
    productId = Number(insertResult.insertId);
  }

  await pool.query("DELETE FROM product_aliases WHERE product_id = ?", [productId]);
  for (const alias of aliases) {
    await pool.query(`INSERT INTO product_aliases (product_id, alias) VALUES (?, ?)`, [productId, alias]);
  }

  await pool.query("DELETE FROM product_translations WHERE product_id = ?", [productId]);
  for (const [languageCode, translation] of Object.entries(translations)) {
    await pool.query(
      `INSERT INTO product_translations (product_id, language_code, name, description) VALUES (?, ?, ?, ?)`,
      [productId, languageCode, translation.name, translation.description]
    );
  }

  return productId;
}

export async function upsertProduct(productInput) {
  if (!isDatabaseConfigured()) {
    throw new Error("Base de donnees non configuree");
  }

  const pool = await getDbPool();
  const productId = await upsertProductRecord(pool, productInput);
  const [rows] = await pool.query("SELECT * FROM products WHERE id = ? LIMIT 1", [productId]);
  return mapProductRow(rows[0]);
}

export async function replaceCatalogProducts(catalogId, products) {
  if (!isDatabaseConfigured()) {
    throw new Error("Base de donnees non configuree");
  }

  const numericCatalogId = Number(catalogId);
  if (!numericCatalogId) {
    throw new Error("catalogId invalide");
  }

  const pool = await getDbPool();
  const [catalogRows] = await pool.query(
    "SELECT id FROM catalogs WHERE id = ? AND is_active = 1 LIMIT 1",
    [numericCatalogId]
  );
  if (!catalogRows.length) {
    throw new Error("Catalogue introuvable");
  }

  await pool.query("DELETE FROM catalog_products WHERE catalog_id = ?", [numericCatalogId]);

  const payloadProducts = Array.isArray(products) ? products : [];
  for (let index = 0; index < payloadProducts.length; index += 1) {
    const productInput = payloadProducts[index];
    const productId = await upsertProductRecord(pool, productInput);
    await pool.query(
      `INSERT INTO catalog_products (catalog_id, product_id, priority)
       VALUES (?, ?, ?)`,
      [numericCatalogId, productId, Number(productInput.priority || (index + 1) * 10)]
    );
  }

  return listCatalogs();
}