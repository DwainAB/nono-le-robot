import { config } from "./config.js";

export async function createAssistantReply({ message, sessionId, language, history, locationContext }) {
  if (!config.openAiApiKey) {
    return null;
  }

  const targetLanguage = language || "fr";

  const systemPrompt = [
    "Tu es la voix d'un robot vendeur en magasin.",
    "Tu reponds en phrases courtes, naturelles et faciles a dire a l'oral.",
    "Tu n'utilises ni markdown, ni listes, ni emojis.",
    `Tu reponds uniquement dans la langue demandee: ${targetLanguage}.`,
    "Si un emplacement magasin est fourni, tu dois l'utiliser tel quel et proposer de guider le client.",
    "Si tu ne sais pas, dis simplement que tu vas demander plus de precision."
  ].join(" ");

  const messages = [
    {
      role: "system",
      content: systemPrompt
    }
  ];

  for (const item of history.slice(-8)) {
    messages.push({
      role: item.role,
      content: item.content
    });
  }

  const userPayload = [
    `Langue: ${targetLanguage}`,
    `Session: ${sessionId}`,
    locationContext ? `Contexte emplacement: ${locationContext}` : null,
    `Message utilisateur: ${message}`
  ]
    .filter(Boolean)
    .join("\n");

  messages.push({
    role: "user",
    content: userPayload
  });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openAiApiKey}`
    },
    body: JSON.stringify({
      model: config.openAiModel,
      input: messages
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.output_text?.trim() || null;
}
