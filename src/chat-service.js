import crypto from "node:crypto";
import { createAssistantReply } from "./openai-chat.js";
import {
  buildLocationContextText,
  buildStoreInformationContextText,
  findLocationFromMessage,
  findStoreInformationFromMessage,
  listKnownLocations
} from "./store-map.js";

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
      return "Hello, how can I help you?";
    case "zh":
      return "您好，我可以怎么帮助您？";
    case "ar":
      return "مرحبًا، كيف يمكنني مساعدتك؟";
    case "fr":
    default:
      return "Bonjour, en quoi puis-je vous aider ?";
  }
}

function buildPlaceDescription(location, language) {
  const resolvedLanguage = normalizeLanguage(language);
  const zone = location.zone;
  const details = location.details;
  const floorLabel = location.floorLabel;

  if (resolvedLanguage === "en") {
    return [zone, details, floorLabel].filter(Boolean).join(", ");
  }

  if (resolvedLanguage === "zh") {
    return [zone, details, floorLabel].filter(Boolean).join("，");
  }

  if (resolvedLanguage === "ar") {
    return [zone, details, floorLabel].filter(Boolean).join("، ");
  }

  return [zone, details, floorLabel].filter(Boolean).join(", ");
}

function buildLocationReply(match, language) {
  const resolvedLanguage = normalizeLanguage(language);
  const location = match.location;
  const subject = match.itemName || localizeLocationName(location, resolvedLanguage);
  const place = buildPlaceDescription(location, resolvedLanguage);

  switch (resolvedLanguage) {
    case "en":
      return `You can find ${subject} in ${place}. I can take you there if you want.`;
    case "zh":
      return `您可以在${place}找到${subject}。如果您愿意，我可以带您过去。`;
    case "ar":
      return `يمكنك العثور على ${subject} في ${place}. يمكنني أن آخذك إليها إذا أردت.`;
    case "fr":
    default:
      return `Vous trouverez ${subject} dans ${place}. Je peux vous y guider si vous voulez.`;
  }
}

function buildLocationOnlyReply(match, language) {
  const resolvedLanguage = normalizeLanguage(language);
  const location = match.location;
  const subject = match.itemName || localizeLocationName(location, resolvedLanguage);
  const place = buildPlaceDescription(location, resolvedLanguage);

  switch (resolvedLanguage) {
    case "en":
      return `You can find ${subject} in ${place}.`;
    case "zh":
      return `您可以在${place}找到${subject}。`;
    case "ar":
      return `يمكنك العثور على ${subject} في ${place}.`;
    case "fr":
    default:
      return `Vous trouverez ${subject} dans ${place}.`;
  }
}

function buildStoreInformationReply(entries, language) {
  const resolvedLanguage = normalizeLanguage(language);
  const items = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!items.length) {
    return null;
  }

  const first = items[0];

  if (first.kind === "event" && items.length > 1) {
    const values = items.map((entry) => `${entry.title}: ${entry.value}`).join(" ; ");
    switch (resolvedLanguage) {
      case "en":
        return `Current events: ${values}.`;
      case "zh":
        return `当前活动：${values}。`;
      case "ar":
        return `الفعاليات الحالية: ${values}.`;
      case "fr":
      default:
        return `Voici les evenements en cours : ${values}.`;
    }
  }

  switch (resolvedLanguage) {
    case "en":
      return `${first.title}: ${first.value}.`;
    case "zh":
      return `${first.title}：${first.value}。`;
    case "ar":
      return `${first.title}: ${first.value}.`;
    case "fr":
    default:
      return `${first.title} : ${first.value}.`;
  }
}

function buildUnknownLocationReply(language) {
  switch (normalizeLanguage(language)) {
    case "en":
      return "I do not know where it is at the moment.";
    case "zh":
      return "我暂时不知道它在哪里。";
    case "ar":
      return "لا أعرف أين يوجد هذا المكان الآن.";
    case "fr":
    default:
      return "Je ne sais pas ou cela se trouve pour le moment.";
  }
}

function buildGenericHelpReply(language) {
  switch (normalizeLanguage(language)) {
    case "en":
      return "Hello, how can I help you?";
    case "zh":
      return "您好，我可以怎么帮助您？";
    case "ar":
      return "مرحبًا، كيف يمكنني مساعدتك؟";
    case "fr":
    default:
      return "Bonjour, en quoi puis-je vous aider ?";
  }
}

function isLocationIntent(message, language) {
  const normalized = String(message || "").trim().toLowerCase();
  if (!normalized) return false;

  const patterns = {
    fr: [/ou sont?/i, /je cherche/i, /ou se trouvent?/i, /je voudrais/i],
    en: [/where is/i, /where are/i, /i am looking for/i, /i want/i],
    zh: [/在哪/i, /我想找/i, /有没有/i],
    ar: [/اين/i, /أين/i, /ابحث عن/i, /أريد/i]
  };

  return (patterns[normalizeLanguage(language)] || patterns.fr).some((pattern) => pattern.test(normalized));
}

function buildNavigableContext(language, navigableLocations) {
  const resolvedLanguage = normalizeLanguage(language);
  if (!navigableLocations.length) {
    return null;
  }

  return navigableLocations
    .map((item) => {
      const name = item.labels?.[resolvedLanguage]?.name || item.name;
      const zone = item.labels?.[resolvedLanguage]?.zone || item.zone;
      const details = item.labels?.[resolvedLanguage]?.details || item.details;
      return `${name}: ${zone}, ${details}`;
    })
    .join(" ; ");
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

export async function handleChat({ message, sessionId, language = "fr", navigableLocationIds = [] }) {
  const trimmedMessage = String(message || "").trim();
  if (!trimmedMessage) {
    throw new Error("Message vide");
  }

  const session = getSession(sessionId);
  const history = session.session.history;
  const matchedLocation = await findLocationFromMessage(trimmedMessage);
  const matchedStoreInformation = await findStoreInformationFromMessage(trimmedMessage);
  const extractedFirstName = !session.session.firstName ? extractFirstName(trimmedMessage) : null;
  const resolvedLanguage = normalizeLanguage(language);
  const navigableSet = new Set((Array.isArray(navigableLocationIds) ? navigableLocationIds : []).map((item) => String(item)));
  const allLocations = await listKnownLocations();
  const dbNavigableLocations = allLocations.filter(
    (item) => item.robotCanNavigate && item.isCurrentlyAvailable
  );
  const navigableLocations = navigableSet.size
    ? dbNavigableLocations.filter((item) => navigableSet.has(item.id))
    : dbNavigableLocations;

  pushHistory(session.sessionId, "user", trimmedMessage);

  let reply;
  let action = null;

  if (matchedLocation) {
    const canNavigate =
      matchedLocation.location.robotCanNavigate &&
      matchedLocation.location.isCurrentlyAvailable &&
      (!navigableSet.size || navigableSet.has(matchedLocation.location.id));

    if (canNavigate) {
      reply = buildLocationReply(matchedLocation, resolvedLanguage);
      action = {
        type: "navigate",
        destination: matchedLocation.location.zone || matchedLocation.location.name,
        locationId: matchedLocation.location.id
      };
    } else {
      reply = buildLocationOnlyReply(matchedLocation, resolvedLanguage);
    }
  } else if (matchedStoreInformation.length) {
    reply = buildStoreInformationReply(matchedStoreInformation, resolvedLanguage);
  } else if (extractedFirstName) {
    updateFirstName(session.sessionId, extractedFirstName || trimmedMessage);
    reply = buildGenericHelpReply(resolvedLanguage);
  } else if (isLocationIntent(trimmedMessage, resolvedLanguage)) {
    reply = buildUnknownLocationReply(resolvedLanguage);
  } else {
    const locationNames = await buildLocationContextText(resolvedLanguage);
    const storeInformationContext = await buildStoreInformationContextText(resolvedLanguage);
    const navigableContext = buildNavigableContext(resolvedLanguage, navigableLocations);

    reply =
      (await createAssistantReply({
        message: trimmedMessage,
        sessionId: session.sessionId,
        language: resolvedLanguage,
        history,
        locationContext: [locationNames, storeInformationContext].filter(Boolean).join(" ; "),
        navigableContext
      })) || buildFallbackReply(trimmedMessage, resolvedLanguage);
  }

  pushHistory(session.sessionId, "assistant", reply);

  return {
    sessionId: session.sessionId,
    reply,
    action
  };
}
