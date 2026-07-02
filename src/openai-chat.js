import { config } from "./config.js";

export async function createAssistantReply({ message, sessionId, language, history, locationContext, navigableContext }) {
  if (!config.openAiApiKey) {
    return null;
  }

  const targetLanguage = language || "fr";

  const systemPrompt = [
    "Tu es la voix d'un robot d'accueil installe dans une boutique de luxe.",
    "Ton ton est poli, fluide, sobre, chaleureux et professionnel.",
    "Tu parles comme un accueil haut de gamme, sans etre froid ni trop familier.",
    "Tu reponds pour l'oral, avec des phrases courtes, claires et naturelles.",
    "Tu n'utilises ni markdown, ni listes, ni emojis.",
    `Tu reponds uniquement dans la langue demandee: ${targetLanguage}.`,
    "Tu aides surtout a informer le client sur les produits, les rayons, les services, les horaires et les informations magasin fournies par le systeme.",
    "Tu n'inventes jamais un emplacement, un horaire, un stock ou un service.",
    "Si l'information n'existe pas dans le contexte, tu dis simplement que tu ne sais pas ou tu demandes une precision.",
    "Tu ne proposes d'accompagner le client que si un point robot disponible est explicitement fourni pour ce lieu.",
    "Si aucun point robot n'est disponible pour ce lieu, tu donnes seulement l'information sans proposer d'accompagnement.",
    "Quand un point robot existe pour le lieu demande, tu peux terminer ta reponse par une proposition simple du type: Souhaitez-vous que je vous y emmene ?",
    "Tu ne mentionnes jamais de details techniques comme base de donnees, backoffice, action, point robot, identifiant ou systeme interne.",
    "Tu ne repetes pas inutilement le prenom du client.",
    "Quand le client pose une question simple, ta reponse doit rester breve.",
    "Exemple attendu: Les toilettes se trouvent au fond a gauche, dans l'espace services. Souhaitez-vous que je vous y emmene ?",
    "Exemple attendu si aucun guidage n'est possible: Les talons se trouvent au rayon chaussures, allee 2.",
    "Exemple attendu si l'information manque: Je suis desole, je ne sais pas ou cela se trouve pour le moment."
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
    locationContext ? `Informations magasin connues: ${locationContext}` : null,
    navigableContext ? `Lieux reellement accessibles par le robot: ${navigableContext}` : null,
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

export async function resolveCatalogMatch({
  message,
  language,
  locations,
  storeInformation
}) {
  if (!config.openAiApiKey) {
    return null;
  }

  const catalogText = [
    "Lieux connus :",
    ...(locations || []).map((location) => {
      const contents = (location.items || []).map((item) => item.name).filter(Boolean).join(", ");
      return `- ${location.name} | info: ${location.details || location.zone || "non renseigne"} | contenus: ${contents || "aucun"} | navigation: ${location.robotCanNavigate ? "possible" : "impossible"} | disponible: ${location.isCurrentlyAvailable ? "oui" : "non"}`;
    }),
    "Informations generales :",
    ...(storeInformation || []).map((entry) => `- ${entry.title}: ${entry.value}`)
  ].join("\n");

  const systemPrompt = [
    "Tu aides un backend a comprendre la demande d'un client dans n'importe quelle langue.",
    "Les donnees du catalogue peuvent etre ecrites dans une seule autre langue.",
    "Tu dois faire la correspondance semantique entre la demande du client et le bon lieu ou la bonne information.",
    "Ne traduis pas mot a mot seulement, comprends le sens.",
    "Si un client demande un produit ou un service, retrouve le lieu le plus pertinent.",
    "Reponds uniquement en JSON valide sans markdown.",
    "Format exact attendu:",
    "{\"type\":\"location|store_info|none\",\"locationName\":\"... ou null\",\"storeInfoTitle\":\"... ou null\",\"reason\":\"courte explication\"}"
  ].join(" ");

  const userPrompt = [
    `Langue client: ${language || "fr"}`,
    `Demande client: ${message}`,
    catalogText
  ].join("\n\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openAiApiKey}`
    },
    body: JSON.stringify({
      model: config.openAiModel,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = data.output_text?.trim();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
