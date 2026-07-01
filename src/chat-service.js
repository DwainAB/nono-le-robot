import crypto from "node:crypto";
import { createAssistantReply } from "./openai-chat.js";
import { findLocationFromMessage, listKnownLocations } from "./store-map.js";

const sessions = new Map();
function getSession(sessionId) {
  const resolvedSessionId = sessionId || crypto.randomUUID();
  if (!sessions.has(resolvedSessionId)) {
    sessions.set(resolvedSessionId, {
      history: [],
      firstName: null
    });
  }
  return {
    sessionId: resolvedSessionId,
    session: sessions.get(resolvedSessionId)
  };
}

function pushHistory(sessionId, role, content) {
  const session = sessions.get(sessionId) || { history: [], firstName: null };
  const history = session.history || [];
  history.push({ role, content });
  if (history.length > 20) {
    history.splice(0, history.length - 20);
  }
  sessions.set(sessionId, {
    ...session,
    history
  });
}

function updateFirstName(sessionId, firstName) {
  const session = sessions.get(sessionId) || { history: [], firstName: null };
  sessions.set(sessionId, {
    ...session,
    firstName
  });
}

function formatFirstName(value) {
  if (!value) return value;
  const cleaned = value
    .trim()
    .replace(/[^\p{L}' -]/gu, "")
    .replace(/\s+/g, " ");
  if (!cleaned) return null;
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => {
      if (/^[A-Za-zÀ-ÿ]/.test(part)) {
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      }
      return part;
    })
    .join(" ");
}

function extractFirstName(message) {
  const normalized = String(message || "").trim();
  if (!normalized) return null;

  const directPatterns = [
    /(?:je m'appelle|moi c'est|mon prenom est|mon prénom est)\s+([a-zA-ZÀ-ÿ' -]+)/i,
    /(?:i am|my name is|i'm)\s+([a-zA-ZÀ-ÿ' -]+)/i,
    /(?:我叫|我的名字是)\s*([^\s,.!?，。！？]{1,20})/i,
    /(?:اسمي|انا|أنا)\s+([^\s,.!?،]{1,20})/i
  ];

  for (const pattern of directPatterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return formatFirstName(match[1].split(/\s+/)[0]);
    }
  }

  if (/^[\p{L}' -]{2,40}$/u.test(normalized) && normalized.split(/\s+/).length <= 2) {
    return formatFirstName(normalized.split(/\s+/)[0]);
  }

  return null;
}

function normalizeLanguage(language) {
  const value = String(language || "fr").toLowerCase();
  if (value.startsWith("fr")) return "fr";
  if (value.startsWith("en")) return "en";
  if (value.startsWith("zh")) return "zh";
  if (value.startsWith("ar")) return "ar";
  return "fr";
}

function localizeLocationName(location, language) {
  return location.labels?.[language]?.name || location.name;
}

function localizeLocationZone(location, language) {
  return location.labels?.[language]?.zone || location.zone;
}

function localizeLocationDetails(location, language) {
  return location.labels?.[language]?.details || location.details;
}

function buildGreetingWithFirstName(firstName, language) {
  switch (normalizeLanguage(language)) {
    case "en":
      return `Hello ${firstName}, how can I help you?`;
    case "zh":
      return `${firstName}，您好，我可以怎么帮助您？`;
    case "ar":
      return `مرحبًا ${firstName}، كيف يمكنني مساعدتك؟`;
    case "fr":
    default:
      return `Bonjour ${firstName}, en quoi puis-je vous aider ?`;
  }
}

function buildLocationReply(location, language) {
  const resolvedLanguage = normalizeLanguage(language);
  const locationName = localizeLocationName(location, resolvedLanguage);
  const locationZone = localizeLocationZone(location, resolvedLanguage);
  const locationDetails = localizeLocationDetails(location, resolvedLanguage);

  switch (resolvedLanguage) {
    case "en":
      return `The ${locationName} are in ${locationZone}, ${locationDetails}. I can take you there if you want.`;
    case "zh":
      return `${locationName}在${locationZone}，${locationDetails}。如果您愿意，我可以带您过去。`;
    case "ar":
      return `${locationName} موجودة في ${locationZone}، ${locationDetails}. يمكنني أن آخذك إليها إذا أردت.`;
    case "fr":
    default:
      return `Les ${locationName} sont au ${locationZone}, ${locationDetails}. Je peux vous y guider si vous voulez.`;
  }
}

function buildFallbackReply(message, language) {
  const resolvedLanguage = normalizeLanguage(language);

  if (/bonjour|salut|hello|hi|你好|您好|مرحبا|السلام/i.test(message)) {
    switch (resolvedLanguage) {
      case "en":
        return "Hello, how can I help you?";
      case "zh":
        return "您好，我可以帮您什么？";
      case "ar":
        return "مرحبًا، كيف يمكنني مساعدتك؟";
      case "fr":
      default:
        return "Bonjour, que puis-je faire pour vous aider ?";
    }
  }

  switch (resolvedLanguage) {
    case "en":
      return "I can help you find a product, a section or a service in the store. Just tell me what you are looking for.";
    case "zh":
      return "我可以帮您找到商品、区域或门店服务。请直接告诉我您在找什么。";
    case "ar":
      return "يمكنني مساعدتك في العثور على منتج أو قسم أو خدمة داخل المتجر. فقط أخبرني بما تبحث عنه.";
    case "fr":
    default:
      return "Je peux vous aider a trouver un produit, un rayon ou un service du magasin. Dites-moi simplement ce que vous cherchez.";
  }
}

function buildLocationContextText(language) {
  const resolvedLanguage = normalizeLanguage(language);
  const locations = listKnownLocations();

  return locations
    .map((item) => {
      const name = item.labels?.[resolvedLanguage]?.name || item.name;
      const zone = item.labels?.[resolvedLanguage]?.zone || item.zone;
      const details = item.labels?.[resolvedLanguage]?.details || item.details;
      return `${name}: ${zone}, ${details}`;
    })
    .join(" ; ");
}

export async function handleChat({ message, sessionId, language = "fr" }) {
  const trimmedMessage = String(message || "").trim();
  if (!trimmedMessage) {
    throw new Error("Message vide");
  }

  const session = getSession(sessionId);
  const history = session.session.history;
  const matchedLocation = findLocationFromMessage(trimmedMessage);
  const extractedFirstName = !session.session.firstName ? extractFirstName(trimmedMessage) : null;
  const resolvedLanguage = normalizeLanguage(language);

  pushHistory(session.sessionId, "user", trimmedMessage);

  let reply;
  let action = null;

  if (matchedLocation) {
    reply = buildLocationReply(matchedLocation, resolvedLanguage);
    action = {
      type: "navigate",
      destination: matchedLocation.zone,
      locationId: matchedLocation.id
    };
  } else if (extractedFirstName) {
    updateFirstName(session.sessionId, extractedFirstName);
    reply = buildGreetingWithFirstName(extractedFirstName, resolvedLanguage);
  } else {
    const locationNames = buildLocationContextText(resolvedLanguage);

    reply =
      (await createAssistantReply({
        message: trimmedMessage,
        sessionId: session.sessionId,
        language: resolvedLanguage,
        history,
        locationContext: locationNames
      })) || buildFallbackReply(trimmedMessage, resolvedLanguage);
  }

  pushHistory(session.sessionId, "assistant", reply);

  return {
    sessionId: session.sessionId,
    reply,
    action
  };
}
