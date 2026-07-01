import fs from "node:fs";
import path from "node:path";

const storeMapPath = path.resolve(process.cwd(), "data", "store-map.json");
const storeMap = JSON.parse(fs.readFileSync(storeMapPath, "utf8"));

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findLocationFromMessage(message) {
  const normalizedMessage = normalize(message);
  if (!normalizedMessage) {
    return null;
  }

  for (const location of storeMap.locations) {
    const candidates = [location.name, ...(location.synonyms || [])];
    for (const candidate of candidates) {
      const normalizedCandidate = normalize(candidate);
      if (!normalizedCandidate) {
        continue;
      }
      if (
        normalizedMessage.includes(normalizedCandidate) ||
        normalizedCandidate.includes(normalizedMessage)
      ) {
        return location;
      }
    }
  }

  return null;
}

export function listKnownLocations() {
  return storeMap.locations.map(({ id, name, zone, details, labels }) => ({
    id,
    name,
    zone,
    details,
    labels
  }));
}
