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

function mapLocationRow(row) {
  return {
    id: String(row.id),
    slug: row.slug,
    externalRobotId: row.external_robot_id,
    name: row.name,
    zone: row.zone,
    details: row.details,
    floorLabel: row.floor_label,
    description: row.description,
    robotCanNavigate: Boolean(row.robot_can_navigate),
    isCurrentlyAvailable: Boolean(row.is_currently_available),
    isActive: Boolean(row.is_active),
    source: row.source,
    lastSeenByRobotAt: row.last_seen_by_robot_at,
    aliases: [],
    items: []
  };
}

async function fetchCatalogSnapshot() {
  if (!isDatabaseConfigured()) {
    return {
      locations: [],
      storeInformation: []
    };
  }

  const pool = await getDbPool();
  const [locationRows] = await pool.query(
    `SELECT *
     FROM locations
     WHERE is_active = 1
     ORDER BY name ASC`
  );
  const [locationAliasRows] = await pool.query(
    `SELECT location_id, alias
     FROM location_aliases
     WHERE is_active = 1`
  );
  const [locationItemRows] = await pool.query(
    `SELECT
       li.location_id,
       li.priority,
       li.notes,
       i.id AS item_id,
       i.slug AS item_slug,
       i.name AS item_name,
       i.category AS item_category,
       i.description AS item_description,
       ia.alias AS item_alias
     FROM location_items li
     INNER JOIN items i ON i.id = li.item_id AND i.is_active = 1
     LEFT JOIN item_aliases ia ON ia.item_id = i.id AND ia.is_active = 1
     WHERE li.is_active = 1
     ORDER BY li.priority ASC, i.name ASC`
  );
  const [storeInformationRows] = await pool.query(
    `SELECT *
     FROM store_information
     WHERE is_active = 1
     ORDER BY
       CASE kind
         WHEN 'hours' THEN 1
         WHEN 'phone' THEN 2
         WHEN 'email' THEN 3
         WHEN 'event' THEN 4
         ELSE 5
       END,
       title ASC`
  );

  const locations = locationRows.map(mapLocationRow);
  const locationsById = new Map(locations.map((location) => [Number(location.id), location]));
  const itemRefsByLocationAndItem = new Map();

  for (const row of locationAliasRows) {
    const location = locationsById.get(Number(row.location_id));
    if (!location) {
      continue;
    }
    location.aliases.push(row.alias);
  }

  for (const row of locationItemRows) {
    const location = locationsById.get(Number(row.location_id));
    if (!location) {
      continue;
    }

    const itemKey = `${row.location_id}:${row.item_id}`;
    let itemRef = itemRefsByLocationAndItem.get(itemKey);
    if (!itemRef) {
      itemRef = {
        id: String(row.item_id),
        slug: row.item_slug,
        name: row.item_name,
        category: row.item_category,
        description: row.item_description,
        priority: row.priority,
        notes: row.notes,
        aliases: []
      };
      itemRefsByLocationAndItem.set(itemKey, itemRef);
      location.items.push(itemRef);
    }

    if (row.item_alias) {
      itemRef.aliases.push(row.item_alias);
    }
  }

  for (const location of locations) {
    location.aliases = deduplicateStrings(location.aliases);
    for (const item of location.items) {
      item.aliases = deduplicateStrings(item.aliases);
    }
  }

  return {
    locations,
    storeInformation: storeInformationRows.map((row) => ({
      id: String(row.id),
      slug: row.slug,
      title: row.title,
      kind: row.kind,
      value: row.value_text,
      startsAt: row.starts_at,
      endsAt: row.ends_at
    }))
  };
}

function chooseBestItemLocation(locations, itemName) {
  const ordered = locations
    .slice()
    .sort((left, right) => {
      if (left.location.robotCanNavigate !== right.location.robotCanNavigate) {
        return Number(right.location.robotCanNavigate) - Number(left.location.robotCanNavigate);
      }
      if (left.location.isCurrentlyAvailable !== right.location.isCurrentlyAvailable) {
        return Number(right.location.isCurrentlyAvailable) - Number(left.location.isCurrentlyAvailable);
      }
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }
      return left.location.name.localeCompare(right.location.name, "fr");
    });

  return {
    type: "item",
    itemName,
    location: ordered[0]?.location || null
  };
}

export async function listKnownLocations() {
  const snapshot = await fetchCatalogSnapshot();
  return snapshot.locations;
}

export async function listStoreInformation() {
  const snapshot = await fetchCatalogSnapshot();
  return snapshot.storeInformation;
}

export async function findLocationFromMessage(message) {
  const normalizedMessage = normalize(message);
  if (!normalizedMessage) {
    return null;
  }

  const snapshot = await fetchCatalogSnapshot();
  let bestLocationMatch = null;
  let bestLocationScore = 0;

  for (const location of snapshot.locations) {
    const locationCandidates = [
      location.name,
      location.zone,
      location.details,
      location.floorLabel,
      ...location.aliases
    ];

    for (const candidate of locationCandidates) {
      const score = scoreCandidate(normalizedMessage, candidate);
      if (score > bestLocationScore) {
        bestLocationScore = score;
        bestLocationMatch = {
          type: "location",
          itemName: null,
          location
        };
      }
    }
  }

  let bestItemName = null;
  let bestItemScore = 0;
  const candidateItemLocations = [];

  for (const location of snapshot.locations) {
    for (const item of location.items) {
      const itemCandidates = [item.name, item.category, item.description, ...item.aliases];

      for (const candidate of itemCandidates) {
        const score = scoreCandidate(normalizedMessage, candidate);
        if (score <= 0) {
          continue;
        }

        if (score > bestItemScore) {
          bestItemScore = score;
          bestItemName = item.name;
          candidateItemLocations.length = 0;
        }

        if (score === bestItemScore) {
          candidateItemLocations.push({
            location,
            priority: item.priority
          });
        }
      }
    }
  }

  if (bestItemScore > bestLocationScore && candidateItemLocations.length) {
    return chooseBestItemLocation(candidateItemLocations, bestItemName);
  }

  return bestLocationMatch;
}

export async function findStoreInformationFromMessage(message) {
  const normalizedMessage = normalize(message);
  if (!normalizedMessage) {
    return [];
  }

  const snapshot = await fetchCatalogSnapshot();
  const keywordByKind = {
    hours: ["horaire", "horaires", "heure", "heures", "opening", "hours"],
    phone: ["telephone", "numero", "appel", "phone", "number"],
    email: ["email", "mail", "courriel"],
    event: ["evenement", "evenements", "event", "events", "animation", "animations"]
  };

  const directKind = Object.entries(keywordByKind).find(([, keywords]) =>
    keywords.some((keyword) => normalizedMessage.includes(normalize(keyword)))
  )?.[0];

  const scoredEntries = snapshot.storeInformation
    .map((entry) => {
      const directTitleScore = scoreCandidate(normalizedMessage, entry.title);
      const directValueScore = scoreCandidate(normalizedMessage, entry.value);
      const keywordScore = directKind && entry.kind === directKind ? 900 : 0;
      return {
        entry,
        score: Math.max(directTitleScore, directValueScore, keywordScore)
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  if (directKind === "event") {
    return scoredEntries
      .filter((item) => item.entry.kind === "event")
      .map((item) => item.entry);
  }

  if (scoredEntries.length) {
    const bestScore = scoredEntries[0].score;
    return scoredEntries
      .filter((item) => item.score === bestScore)
      .map((item) => item.entry);
  }

  return [];
}

export async function buildLocationContextText() {
  const locations = await listKnownLocations();
  return locations
    .map((location) => {
      const availability = location.robotCanNavigate
        ? location.isCurrentlyAvailable
          ? "guidage robot disponible"
          : "guidage robot indisponible actuellement"
        : "guidage robot impossible";

      const itemsText = location.items.length
        ? ` objets: ${location.items.map((item) => item.name).join(", ")}`
        : "";

      return `${location.name}: ${location.zone || "zone non renseignee"}, ${location.details || "details non renseignes"}, ${availability}.${itemsText}`;
    })
    .join(" ; ");
}

export async function buildStoreInformationContextText() {
  const entries = await listStoreInformation();
  return entries
    .map((entry) => `${entry.kind} - ${entry.title}: ${entry.value}`)
    .join(" ; ");
}

export async function upsertLocation(locationInput) {
  if (!isDatabaseConfigured()) {
    throw new Error("Base de donnees non configuree");
  }

  const name = String(locationInput?.name || "").trim();
  if (!name) {
    throw new Error("Nom de lieu manquant");
  }

  const slug = String(locationInput.slug || slugify(name)).trim();
  const pool = await getDbPool();
  const externalRobotId = locationInput.externalRobotId ? String(locationInput.externalRobotId).trim() : null;

  const [existingRows] = await pool.query(
    `SELECT *
     FROM locations
     WHERE id = ? OR slug = ? OR (? IS NOT NULL AND external_robot_id = ?)
     LIMIT 1`,
    [Number(locationInput.id || 0), slug, externalRobotId, externalRobotId]
  );

  const zone = locationInput.zone ? String(locationInput.zone).trim() : null;
  const details = locationInput.details ? String(locationInput.details).trim() : null;
  const floorLabel = locationInput.floorLabel ? String(locationInput.floorLabel).trim() : null;
  const description = locationInput.description ? String(locationInput.description).trim() : null;
  const robotCanNavigate = toBoolean(locationInput.robotCanNavigate, false);
  const isCurrentlyAvailable = toBoolean(locationInput.isCurrentlyAvailable, false);
  const aliases = deduplicateStrings(Array.isArray(locationInput.aliases) ? locationInput.aliases : []);

  let locationId;

  if (existingRows.length) {
    const existing = existingRows[0];
    const source =
      existing.source === "robot" && !externalRobotId ? "mixed" : existing.source;

    await pool.query(
      `UPDATE locations
       SET slug = ?, external_robot_id = ?, name = ?, zone = ?, details = ?, floor_label = ?, description = ?,
           robot_can_navigate = ?, is_currently_available = ?, is_active = 1, source = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        slug,
        externalRobotId,
        name,
        zone,
        details,
        floorLabel,
        description,
        robotCanNavigate ? 1 : 0,
        isCurrentlyAvailable ? 1 : 0,
        source,
        existing.id
      ]
    );
    locationId = Number(existing.id);
  } else {
    const [insertResult] = await pool.query(
      `INSERT INTO locations
       (slug, external_robot_id, name, zone, details, floor_label, description, robot_can_navigate, is_currently_available, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`,
      [
        slug,
        externalRobotId,
        name,
        zone,
        details,
        floorLabel,
        description,
        robotCanNavigate ? 1 : 0,
        isCurrentlyAvailable ? 1 : 0
      ]
    );
    locationId = Number(insertResult.insertId);
  }

  await pool.query("DELETE FROM location_aliases WHERE location_id = ?", [locationId]);
  for (const alias of aliases) {
    await pool.query(
      `INSERT INTO location_aliases (location_id, alias)
       VALUES (?, ?)`,
      [locationId, alias]
    );
  }

  const [rows] = await pool.query("SELECT * FROM locations WHERE id = ? LIMIT 1", [locationId]);
  return mapLocationRow(rows[0]);
}

async function upsertItemRecord(pool, itemInput) {
  const name = String(itemInput?.name || "").trim();
  if (!name) {
    throw new Error("Nom d'article manquant");
  }

  const slug = String(itemInput.slug || slugify(name)).trim();
  const category = itemInput.category ? String(itemInput.category).trim() : null;
  const description = itemInput.description ? String(itemInput.description).trim() : null;
  const aliases = deduplicateStrings(Array.isArray(itemInput.aliases) ? itemInput.aliases : []);

  const [existingRows] = await pool.query(
    `SELECT *
     FROM items
     WHERE id = ? OR slug = ?
     LIMIT 1`,
    [Number(itemInput.id || 0), slug]
  );

  let itemId;

  if (existingRows.length) {
    await pool.query(
      `UPDATE items
       SET slug = ?, name = ?, category = ?, description = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [slug, name, category, description, existingRows[0].id]
    );
    itemId = Number(existingRows[0].id);
  } else {
    const [insertResult] = await pool.query(
      `INSERT INTO items (slug, name, category, description)
       VALUES (?, ?, ?, ?)`,
      [slug, name, category, description]
    );
    itemId = Number(insertResult.insertId);
  }

  await pool.query("DELETE FROM item_aliases WHERE item_id = ?", [itemId]);
  for (const alias of aliases) {
    await pool.query(
      `INSERT INTO item_aliases (item_id, alias)
       VALUES (?, ?)`,
      [itemId, alias]
    );
  }

  return itemId;
}

export async function replaceLocationItems(locationId, items) {
  if (!isDatabaseConfigured()) {
    throw new Error("Base de donnees non configuree");
  }

  const numericLocationId = Number(locationId);
  if (!numericLocationId) {
    throw new Error("locationId invalide");
  }

  const pool = await getDbPool();
  const [locationRows] = await pool.query(
    "SELECT id FROM locations WHERE id = ? AND is_active = 1 LIMIT 1",
    [numericLocationId]
  );

  if (!locationRows.length) {
    throw new Error("Lieu introuvable");
  }

  await pool.query("DELETE FROM location_items WHERE location_id = ?", [numericLocationId]);

  const payloadItems = Array.isArray(items) ? items : [];
  for (let index = 0; index < payloadItems.length; index += 1) {
    const itemInput = payloadItems[index];
    const itemId = await upsertItemRecord(pool, itemInput);
    await pool.query(
      `INSERT INTO location_items (location_id, item_id, priority, notes)
       VALUES (?, ?, ?, ?)`,
      [
        numericLocationId,
        itemId,
        Number(itemInput.priority || (index + 1) * 10),
        itemInput.notes ? String(itemInput.notes).trim() : null
      ]
    );
  }

  return listKnownLocations();
}

export async function upsertStoreInformation(infoInput) {
  if (!isDatabaseConfigured()) {
    throw new Error("Base de donnees non configuree");
  }

  const title = String(infoInput?.title || "").trim();
  const value = String(infoInput?.value || "").trim();
  if (!title || !value) {
    throw new Error("Titre ou valeur manquants");
  }

  const slug = String(infoInput.slug || slugify(title)).trim();
  const kind = String(infoInput.kind || "general").trim();
  const pool = await getDbPool();
  const [existingRows] = await pool.query(
    `SELECT *
     FROM store_information
     WHERE id = ? OR slug = ?
     LIMIT 1`,
    [Number(infoInput.id || 0), slug]
  );

  if (existingRows.length) {
    await pool.query(
      `UPDATE store_information
       SET slug = ?, title = ?, kind = ?, value_text = ?, is_active = ?, starts_at = ?, ends_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        slug,
        title,
        kind,
        value,
        toBoolean(infoInput.isActive, true) ? 1 : 0,
        infoInput.startsAt || null,
        infoInput.endsAt || null,
        existingRows[0].id
      ]
    );
  } else {
    await pool.query(
      `INSERT INTO store_information (slug, title, kind, value_text, is_active, starts_at, ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        slug,
        title,
        kind,
        value,
        toBoolean(infoInput.isActive, true) ? 1 : 0,
        infoInput.startsAt || null,
        infoInput.endsAt || null
      ]
    );
  }

  return listStoreInformation();
}

export async function syncRobotLocations(locationInputs) {
  if (!isDatabaseConfigured()) {
    throw new Error("Base de donnees non configuree");
  }

  const payloadLocations = Array.isArray(locationInputs) ? locationInputs : [];
  const pool = await getDbPool();
  const syncedLocationIds = [];

  for (const locationInput of payloadLocations) {
    const name = String(locationInput?.name || "").trim();
    const sourceKey = String(
      locationInput?.externalRobotId || locationInput?.robotLocationId || locationInput?.slug || name
    ).trim();

    if (!name || !sourceKey) {
      continue;
    }

    const slug = String(locationInput.slug || slugify(name)).trim();
    const externalRobotId = String(locationInput.externalRobotId || locationInput.robotLocationId || slug).trim();
    const [existingRows] = await pool.query(
      `SELECT *
       FROM locations
       WHERE external_robot_id = ? OR slug = ?
       LIMIT 1`,
      [externalRobotId, slug]
    );

    const zone = locationInput.zone ? String(locationInput.zone).trim() : null;
    const details = locationInput.details ? String(locationInput.details).trim() : null;
    const floorLabel = locationInput.floorLabel ? String(locationInput.floorLabel).trim() : null;
    const description = locationInput.description ? String(locationInput.description).trim() : null;
    const aliases = deduplicateStrings(Array.isArray(locationInput.aliases) ? locationInput.aliases : []);

    let locationId;

    if (existingRows.length) {
      const existing = existingRows[0];
      const source = existing.source === "manual" ? "mixed" : existing.source;

      await pool.query(
        `UPDATE locations
         SET slug = ?, external_robot_id = ?, name = ?, zone = COALESCE(?, zone), details = COALESCE(?, details),
             floor_label = COALESCE(?, floor_label), description = COALESCE(?, description),
             robot_can_navigate = ?, is_currently_available = 1, is_active = 1, source = ?,
             last_seen_by_robot_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          slug,
          externalRobotId,
          name,
          zone,
          details,
          floorLabel,
          description,
          toBoolean(locationInput.robotCanNavigate, true) ? 1 : 0,
          source,
          existing.id
        ]
      );
      locationId = Number(existing.id);
    } else {
      const [insertResult] = await pool.query(
        `INSERT INTO locations
         (slug, external_robot_id, name, zone, details, floor_label, description, robot_can_navigate, is_currently_available, is_active, source, last_seen_by_robot_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'robot', CURRENT_TIMESTAMP)`,
        [
          slug,
          externalRobotId,
          name,
          zone,
          details,
          floorLabel,
          description,
          toBoolean(locationInput.robotCanNavigate, true) ? 1 : 0
        ]
      );
      locationId = Number(insertResult.insertId);
    }

    if (aliases.length) {
      await pool.query("DELETE FROM location_aliases WHERE location_id = ?", [locationId]);
      for (const alias of aliases) {
        await pool.query(
          `INSERT INTO location_aliases (location_id, alias)
           VALUES (?, ?)`,
          [locationId, alias]
        );
      }
    }

    syncedLocationIds.push(locationId);
  }

  if (syncedLocationIds.length) {
    const placeholders = syncedLocationIds.map(() => "?").join(", ");
    await pool.query(
      `UPDATE locations
       SET is_currently_available = 0, updated_at = CURRENT_TIMESTAMP
       WHERE source IN ('robot', 'mixed')
         AND id NOT IN (${placeholders})`,
      syncedLocationIds
    );
  } else {
    await pool.query(
      `UPDATE locations
       SET is_currently_available = 0, updated_at = CURRENT_TIMESTAMP
       WHERE source IN ('robot', 'mixed')`
    );
  }

  return {
    syncedCount: syncedLocationIds.length,
    locations: await listKnownLocations()
  };
}
