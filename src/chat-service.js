import crypto from "node:crypto";
import { createAssistantReply } from "./openai-chat.js";
import { findLocationFromMessage, listKnownLocations } from "./store-map.js";

const sessions = new Map();

function getSession(sessionId) {
  const resolvedSessionId = sessionId || crypto.randomUUID();
  if (!sessions.has(resolvedSessionId)) {
    sessions.set(resolvedSessionId, []);
  }
  return {
    sessionId: resolvedSessionId,
    history: sessions.get(resolvedSessionId)
  };
}

function pushHistory(sessionId, role, content) {
  const history = sessions.get(sessionId) || [];
  history.push({ role, content });
  if (history.length > 20) {
    history.splice(0, history.length - 20);
  }
  sessions.set(sessionId, history);
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
  const matchedLocation = findLocationFromMessage(trimmedMessage);

  pushHistory(session.sessionId, "user", trimmedMessage);

  let reply;
  let action = null;

  if (matchedLocation) {
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
        history: session.history,
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
