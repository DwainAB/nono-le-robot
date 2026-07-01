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
    .replace(/[^a-zA-ZÀ-ÿ' -]/g, "")
    .replace(/\s+/g, " ");
  if (!cleaned) return null;
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function extractFirstName(message) {
  const normalized = String(message || "").trim();
  if (!normalized) return null;

  const directPatterns = [
    /(?:je m'appelle|moi c'est|mon prenom est|mon prénom est)\s+([a-zA-ZÀ-ÿ' -]+)/i,
    /(?:i am|my name is|i'm)\s+([a-zA-ZÀ-ÿ' -]+)/i
  ];

  for (const pattern of directPatterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return formatFirstName(match[1].split(/\s+/)[0]);
    }
  }

  if (/^[a-zA-ZÀ-ÿ' -]{2,40}$/.test(normalized)) {
    return formatFirstName(normalized.split(/\s+/)[0]);
  }

  return null;
}

function buildLocationReply(location) {
  return `Les ${location.name} sont au ${location.zone}, ${location.details}. Je peux vous y guider si vous voulez.`;
}

function buildFallbackReply(message) {
  if (/bonjour|salut|hello/i.test(message)) {
    return "Bonjour, que puis-je faire pour vous aider ?";
  }

  return "Je peux vous aider a trouver un produit, un rayon ou un service du magasin. Dites-moi simplement ce que vous cherchez.";
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

  pushHistory(session.sessionId, "user", trimmedMessage);

  let reply;
  let action = null;

  if (extractedFirstName) {
    updateFirstName(session.sessionId, extractedFirstName);
    reply = `Bonjour ${extractedFirstName}, en quoi puis-je vous aider ?`;
  } else if (matchedLocation) {
    reply = buildLocationReply(matchedLocation);
    action = {
      type: "navigate",
      destination: matchedLocation.zone,
      locationId: matchedLocation.id
    };
  } else {
    const locationNames = listKnownLocations()
      .map((item) => `${item.name}: ${item.zone}, ${item.details}`)
      .join(" ; ");

    reply =
      (await createAssistantReply({
        message: trimmedMessage,
        sessionId: session.sessionId,
        language,
        history,
        locationContext: locationNames
      })) || buildFallbackReply(trimmedMessage);
  }

  pushHistory(session.sessionId, "assistant", reply);

  return {
    sessionId: session.sessionId,
    reply,
    action
  };
}
