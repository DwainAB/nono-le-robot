import { createAudioTranscription } from "./openai-chat.js";

function normalizeLanguage(language) {
  const value = String(language || "").trim().toLowerCase();
  if (value.startsWith("fr")) return "fr";
  if (value.startsWith("en")) return "en";
  if (value.startsWith("es")) return "es";
  if (value.startsWith("ru")) return "ru";
  if (value.startsWith("zh")) return "zh";
  if (value.startsWith("ar")) return "ar";
  return "fr";
}

export async function handleTranscription(payload) {
  const audioBase64 = String(payload?.audioBase64 || "").trim();
  if (!audioBase64) {
    throw new Error("audioBase64 manquant");
  }

  const text = await createAudioTranscription({
    audioBase64,
    mimeType: payload?.mimeType,
    fileName: payload?.fileName,
    language: normalizeLanguage(payload?.language)
  });

  return {
    text
  };
}
