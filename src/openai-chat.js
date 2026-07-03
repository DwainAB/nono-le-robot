import { config } from "./config.js";

const embeddingCache = new Map();

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

export async function createAudioTranscription({
  audioBase64,
  mimeType,
  fileName,
  language
}) {
  if (!config.openAiApiKey) {
    throw new Error("OPENAI_API_KEY manquante");
  }

  if (!audioBase64) {
    throw new Error("Audio manquant");
  }

  const audioBuffer = Buffer.from(audioBase64, "base64");
  if (!audioBuffer.length) {
    throw new Error("Audio vide");
  }

  const formData = new FormData();
  const resolvedMimeType = mimeType || "audio/mp4";
  const resolvedFileName = fileName || "speech.m4a";
  formData.append("model", config.openAiTranscriptionModel);
  if (language) {
    formData.append("language", language);
  }
  formData.append(
    "file",
    new Blob([audioBuffer], { type: resolvedMimeType }),
    resolvedFileName
  );

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI transcription error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.text?.trim() || "";
}

async function createEmbedding(input) {
  if (!config.openAiApiKey) {
    return null;
  }

  const normalizedInput = String(input || "").trim();
  if (!normalizedInput) {
    return null;
  }

  const cached = embeddingCache.get(normalizedInput);
  if (cached) {
    return cached;
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openAiApiKey}`
    },
    body: JSON.stringify({
      model: config.openAiEmbeddingModel,
      input: normalizedInput
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI embedding error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const embedding = data.data?.[0]?.embedding || null;
  if (embedding) {
    embeddingCache.set(normalizedInput, embedding);
  }
  return embedding;
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || !left.length) {
    return -1;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  if (!leftNorm || !rightNorm) {
    return -1;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function buildLocationSearchDocument(location) {
  return [
    location.name,
    location.slug,
    location.externalRobotId,
    ...(location.aliases || []),
    location.zone,
    location.details,
    location.floorLabel,
    location.description,
    ...Object.values(location.labels || {}).flatMap((label) => [
      label?.name,
      label?.zone,
      label?.details,
      label?.description
    ]),
    ...(location.items || []).flatMap((item) => [
      item.name,
      item.slug,
      item.category,
      item.description,
      ...(item.aliases || []),
      ...Object.values(item.labels || {}).flatMap((label) => [
        label?.name,
        label?.category,
        label?.description
      ])
    ])
  ]
    .filter(Boolean)
    .join(" | ");
}

function buildStoreInfoSearchDocument(entry) {
  return [
    entry.title,
    entry.slug,
    entry.kind,
    entry.value,
    ...Object.values(entry.labels || {}).flatMap((label) => [label?.title, label?.value])
  ]
    .filter(Boolean)
    .join(" | ");
}

async function rankCatalogBySemanticSimilarity({ message, locations, storeInformation }) {
  const queryEmbedding = await createEmbedding(message);
  if (!queryEmbedding) {
    return {
      rankedLocations: (locations || []).map((location) => ({ location, score: -1 })),
      rankedStoreInformation: (storeInformation || []).map((entry) => ({ entry, score: -1 }))
    };
  }

  const rankedLocations = await Promise.all(
    (locations || []).map(async (location) => {
      const embedding = await createEmbedding(buildLocationSearchDocument(location));
      return {
        location,
        score: cosineSimilarity(queryEmbedding, embedding)
      };
    })
  );

  const rankedStoreInformation = await Promise.all(
    (storeInformation || []).map(async (entry) => {
      const embedding = await createEmbedding(buildStoreInfoSearchDocument(entry));
      return {
        entry,
        score: cosineSimilarity(queryEmbedding, embedding)
      };
    })
  );

  return {
    rankedLocations: rankedLocations.sort((left, right) => right.score - left.score),
    rankedStoreInformation: rankedStoreInformation.sort((left, right) => right.score - left.score)
  };
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

  const {
    rankedLocations,
    rankedStoreInformation
  } = await rankCatalogBySemanticSimilarity({
    message,
    locations,
    storeInformation
  });

  console.log(
    "[resolveCatalogMatch] semanticCandidates",
    JSON.stringify({
      message,
      language,
      topLocations: rankedLocations.slice(0, 5).map((item) => ({
        id: item.location.id,
        name: item.location.name,
        externalRobotId: item.location.externalRobotId,
        score: Number.isFinite(item.score) ? Number(item.score.toFixed(4)) : item.score
      })),
      topStoreInformation: rankedStoreInformation.slice(0, 5).map((item) => ({
        id: item.entry.id,
        title: item.entry.title,
        kind: item.entry.kind,
        score: Number.isFinite(item.score) ? Number(item.score.toFixed(4)) : item.score
      }))
    })
  );

  const prioritizedLocations = rankedLocations.slice(0, 6).map((item) => item.location);
  const prioritizedStoreInformation = rankedStoreInformation.slice(0, 6).map((item) => item.entry);

  const locationCatalog = prioritizedLocations.map((location) => ({
    id: String(location.id),
    slug: location.slug || null,
    externalRobotId: location.externalRobotId || null,
    name: location.name || null,
    zone: location.zone || null,
    details: location.details || null,
    floorLabel: location.floorLabel || null,
    description: location.description || null,
    aliases: Array.isArray(location.aliases) ? location.aliases : [],
    robotCanNavigate: Boolean(location.robotCanNavigate),
    isCurrentlyAvailable: Boolean(location.isCurrentlyAvailable),
    labels: location.labels || {},
    items: (location.items || []).map((item) => ({
      id: String(item.id),
      slug: item.slug || null,
      name: item.name || null,
      category: item.category || null,
      description: item.description || null,
      aliases: Array.isArray(item.aliases) ? item.aliases : [],
      labels: item.labels || {}
    }))
  }));

  const storeInfoCatalog = prioritizedStoreInformation.map((entry) => ({
    id: String(entry.id),
    slug: entry.slug || null,
    kind: entry.kind || null,
    title: entry.title || null,
    value: entry.value || null,
    labels: entry.labels || {}
  }));

  const locationCandidates = locationCatalog.map((location) => ({
    id: location.id,
    names: [
      location.name,
      location.slug,
      location.externalRobotId,
      ...location.aliases,
      ...Object.values(location.labels || {}).flatMap((label) => [
        label?.name,
        label?.zone,
        label?.details,
        label?.description
      ])
    ].filter(Boolean),
    searchableContext: [
      location.zone,
      location.details,
      location.floorLabel,
      location.description,
      ...(location.items || []).flatMap((item) => [
        item.name,
        item.slug,
        item.category,
        item.description,
        ...(item.aliases || []),
        ...Object.values(item.labels || {}).flatMap((label) => [
          label?.name,
          label?.category,
          label?.description
        ])
      ])
    ].filter(Boolean),
    navigation: {
      robotCanNavigate: location.robotCanNavigate,
      isCurrentlyAvailable: location.isCurrentlyAvailable
    }
  }));

  const storeInfoCandidates = storeInfoCatalog.map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    titles: [
      entry.title,
      entry.slug,
      ...Object.values(entry.labels || {}).flatMap((label) => [label?.title, label?.value])
    ].filter(Boolean),
    value: entry.value
  }));

  const systemPrompt = [
    "Tu aides un backend a comprendre une demande client dans n'importe quelle langue actuelle ou future.",
    "Le catalogue est dynamique et vient d'un backoffice.",
    "Tu dois faire une resolution semantique robuste entre la demande et le catalogue, meme si la demande et les donnees ne sont pas dans la meme langue.",
    "Tu dois raisonner sur le sens, pas sur des mots exacts.",
    "Tu dois choisir uniquement parmi les candidats fournis.",
    "Tu ne dois jamais inventer un identifiant, un lieu ou une information qui n'existe pas dans le catalogue fourni.",
    "Si un produit, service, rayon ou besoin correspond a un lieu du catalogue, retourne l'identifiant canonique de ce lieu.",
    "Si la demande correspond a une information generale du magasin, retourne l'identifiant canonique de cette information.",
    "Les equivalences de sens, les abreviations, les formulations polies, les fautes, les variantes de langues et les traductions implicites doivent etre comprises.",
    "Exemples de meme sens: toilettes, wc, bathroom, restroom, bano, aseos.",
    "Si la demande est une question de localisation ou de recherche, ne retourne jamais type general.",
    "Si la demande est generale ou conversationnelle et ne vise pas clairement un lieu ni une information catalogue, retourne type general.",
    "Si la demande semble viser un lieu, un produit, un service ou une information du magasin mais qu'aucune correspondance fiable n'existe, retourne type none.",
    "Reponds uniquement en JSON valide sans markdown.",
    "Format exact attendu:",
    "{\"type\":\"location|store_info|general|none\",\"locationId\":\"id ou null\",\"storeInfoId\":\"id ou null\",\"reason\":\"courte explication\"}"
  ].join(" ");

  const userPrompt = JSON.stringify(
    {
      customerLanguage: language || "fr",
      customerMessage: message,
      catalog: {
        locations: locationCandidates,
        storeInformation: storeInfoCandidates
      }
    },
    null,
    2
  );

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openAiApiKey}`
    },
    body: JSON.stringify({
      model: config.openAiModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "catalog_match",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: {
                type: "string",
                enum: ["location", "store_info", "general", "none"]
              },
              locationId: {
                anyOf: [
                  { type: "string" },
                  { type: "null" }
                ]
              },
              storeInfoId: {
                anyOf: [
                  { type: "string" },
                  { type: "null" }
                ]
              },
              reason: {
                type: "string"
              }
            },
            required: ["type", "locationId", "storeInfoId", "reason"]
          }
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    console.log(
      "[resolveCatalogMatch] modelResolution",
      JSON.stringify({
        message,
        language,
        resolution: parsed
      })
    );
    return parsed;
  } catch {
    console.warn("[resolveCatalogMatch] invalidJson", text);
    return null;
  }
}
