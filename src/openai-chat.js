import { config } from "./config.js";

const embeddingCache = new Map();

function extractOutputText(data) {
  if (typeof data.output_text === "string") {
    return data.output_text.trim() || null;
  }

  const text = (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text)
    .join("")
    .trim();

  return text || null;
}

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
  return extractOutputText(data);
}

export async function createLocationReply({
  subject,
  place,
  language,
  canNavigate
}) {
  const targetLanguage = language || "fr";

  if (!config.openAiApiKey) {
    return null;
  }

  const systemPrompt = [
    "Tu es la voix d'un robot d'accueil installe dans une boutique de luxe.",
    "Ton ton est poli, fluide, sobre, chaleureux et professionnel.",
    "Tu reponds pour l'oral, avec une phrase courte, claire et naturelle.",
    "Tu n'utilises ni markdown, ni listes, ni emojis.",
    `Tu reponds uniquement dans la langue demandee: ${targetLanguage}.`,
    "On te donne un nom brut de lieu ou de rayon issu d'une base de donnees, et une description brute de son emplacement.",
    "Tu dois reformuler ces informations brutes en une phrase naturelle qui indique au client ou se trouve ce qu'il cherche.",
    "Tu ne recopies jamais le nom brut tel quel s'il n'est pas naturel a l'oral: utilise plutot une formulation courante et polie.",
    "Par exemple wc devient les toilettes, salle 2 devient la salle numero 2.",
    "Tu n'inventes jamais d'information qui n'est pas fournie.",
    canNavigate
      ? "Termine ta reponse par une proposition simple d'accompagnement du type: Souhaitez-vous que je vous y emmene ?"
      : "Ne propose pas d'accompagnement, donne seulement l'information.",
    "Exemple attendu: Les toilettes se trouvent au fond du couloir, a cote du bar. Souhaitez-vous que je vous y emmene ?"
  ].join(" ");

  const userPayload = JSON.stringify({
    nomBrut: subject,
    emplacementBrut: place,
    langue: targetLanguage
  });

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
        { role: "user", content: userPayload }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return extractOutputText(data);
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
    ])
  ]
    .filter(Boolean)
    .join(" | ");
}

function buildProductSearchDocument(product) {
  return [
    product.name,
    product.slug,
    product.description,
    ...(product.aliases || []),
    ...(product.catalogs || []).map((catalog) => catalog.name),
    ...(product.variants || []).map((variant) => variant.label),
    ...Object.values(product.labels || {}).flatMap((label) => [label?.name, label?.description])
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

function buildCatalogSearchDocument(catalog) {
  return [
    catalog.name,
    catalog.slug,
    catalog.description,
    ...(catalog.aliases || []),
    ...(catalog.products || []).map((product) => product.name),
    ...Object.values(catalog.labels || {}).flatMap((label) => [label?.name, label?.description])
  ]
    .filter(Boolean)
    .join(" | ");
}

async function rankCatalogBySemanticSimilarity({ message, locations, storeInformation, products, catalogs }) {
  const queryEmbedding = await createEmbedding(message);
  if (!queryEmbedding) {
    return {
      rankedLocations: (locations || []).map((location) => ({ location, score: -1 })),
      rankedStoreInformation: (storeInformation || []).map((entry) => ({ entry, score: -1 })),
      rankedProducts: (products || []).map((product) => ({ product, score: -1 })),
      rankedCatalogs: (catalogs || []).map((catalog) => ({ catalog, score: -1 }))
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

  const rankedProducts = await Promise.all(
    (products || []).map(async (product) => {
      const embedding = await createEmbedding(buildProductSearchDocument(product));
      return {
        product,
        score: cosineSimilarity(queryEmbedding, embedding)
      };
    })
  );

  const rankedCatalogs = await Promise.all(
    (catalogs || []).map(async (catalog) => {
      const embedding = await createEmbedding(buildCatalogSearchDocument(catalog));
      return {
        catalog,
        score: cosineSimilarity(queryEmbedding, embedding)
      };
    })
  );

  return {
    rankedLocations: rankedLocations.sort((left, right) => right.score - left.score),
    rankedStoreInformation: rankedStoreInformation.sort((left, right) => right.score - left.score),
    rankedProducts: rankedProducts.sort((left, right) => right.score - left.score),
    rankedCatalogs: rankedCatalogs.sort((left, right) => right.score - left.score)
  };
}

export async function resolveCatalogMatch({
  message,
  language,
  locations,
  storeInformation,
  products,
  catalogs,
  history,
  lastProposedProducts
}) {
  if (!config.openAiApiKey) {
    return null;
  }

  const {
    rankedLocations,
    rankedStoreInformation,
    rankedProducts,
    rankedCatalogs
  } = await rankCatalogBySemanticSimilarity({
    message,
    locations,
    storeInformation,
    products,
    catalogs
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
      })),
      topProducts: rankedProducts.slice(0, 8).map((item) => ({
        id: item.product.id,
        name: item.product.name,
        score: Number.isFinite(item.score) ? Number(item.score.toFixed(4)) : item.score
      })),
      topCatalogs: rankedCatalogs.slice(0, 5).map((item) => ({
        id: item.catalog.id,
        name: item.catalog.name,
        score: Number.isFinite(item.score) ? Number(item.score.toFixed(4)) : item.score
      }))
    })
  );

  const prioritizedLocations = rankedLocations.slice(0, 6).map((item) => item.location);
  const prioritizedStoreInformation = rankedStoreInformation.slice(0, 6).map((item) => item.entry);
  const prioritizedProducts = rankedProducts.slice(0, 10).map((item) => item.product);
  const prioritizedCatalogs = rankedCatalogs.slice(0, 5).map((item) => item.catalog);

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
    labels: location.labels || {}
  }));

  const storeInfoCatalog = prioritizedStoreInformation.map((entry) => ({
    id: String(entry.id),
    slug: entry.slug || null,
    kind: entry.kind || null,
    title: entry.title || null,
    value: entry.value || null,
    labels: entry.labels || {}
  }));

  const productCatalog = prioritizedProducts.map((product) => ({
    id: String(product.id),
    slug: product.slug || null,
    name: product.name || null,
    description: product.description || null,
    imageUrl: product.imageUrl || null,
    aliases: Array.isArray(product.aliases) ? product.aliases : [],
    catalogs: (product.catalogs || []).map((catalog) => catalog.name).filter(Boolean),
    variants: (product.variants || []).map((variant) => ({
      label: variant.label,
      price: variant.price,
      currency: variant.currency
    })),
    labels: product.labels || {}
  }));

  const catalogCatalog = prioritizedCatalogs.map((catalog) => ({
    id: String(catalog.id),
    slug: catalog.slug || null,
    name: catalog.name || null,
    description: catalog.description || null,
    aliases: Array.isArray(catalog.aliases) ? catalog.aliases : [],
    locationNames: (catalog.locations || []).map((location) => location.name).filter(Boolean),
    labels: catalog.labels || {}
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
    searchableContext: [location.zone, location.details, location.floorLabel, location.description].filter(Boolean),
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

  const productCandidates = productCatalog.map((product) => ({
    id: product.id,
    names: [
      product.name,
      product.slug,
      ...product.aliases,
      ...Object.values(product.labels || {}).flatMap((label) => [label?.name, label?.description])
    ].filter(Boolean),
    description: product.description || null,
    searchableContext: [product.description, ...product.catalogs].filter(Boolean),
    availableVariants: product.variants.map((variant) => variant.label)
  }));

  const catalogCandidates = catalogCatalog.map((catalog) => ({
    id: catalog.id,
    names: [
      catalog.name,
      catalog.slug,
      ...catalog.aliases,
      ...Object.values(catalog.labels || {}).flatMap((label) => [label?.name, label?.description])
    ].filter(Boolean),
    searchableContext: [catalog.description, ...catalog.locationNames].filter(Boolean)
  }));

  const recentHistory = (history || []).slice(-6).map((item) => ({
    role: item.role,
    content: item.content
  }));

  const lastProposedProductCandidates = (lastProposedProducts || []).map((product) => ({
    id: String(product.id),
    name: product.name
  }));

  const systemPrompt = [
    "Tu aides un backend a comprendre une demande client dans n'importe quelle langue actuelle ou future, dans le cadre d'une conversation qui peut se derouler sur plusieurs messages.",
    "Le catalogue est dynamique et vient d'un backoffice. Il contient des catalogues (regroupements de produits, ex: Maroquinerie, Fragrance), des produits individuels, des lieux et des informations magasin.",
    "Tu dois faire une resolution semantique robuste entre la demande et le catalogue, meme si la demande et les donnees ne sont pas dans la meme langue.",
    "Tu dois raisonner sur le sens, pas sur des mots exacts.",
    "Tu dois choisir uniquement parmi les candidats fournis.",
    "Tu ne dois jamais inventer un identifiant, un lieu, un produit, un catalogue ou une information qui n'existe pas dans le catalogue fourni.",
    "",
    "Voici les types de reponse possibles et quand les utiliser:",
    "",
    "- type product: la demande vise un produit precis et identifiable (le client connait deja le nom du produit, ou un seul produit correspond clairement). Retourne productId. Chaque produit peut avoir plusieurs variantes (par exemple des contenances differentes comme 100ml, 200ml, 500ml), chacune avec son propre prix. Si la demande precise une variante particuliere, identifie exactement quelle variante parmi availableVariants correspond et renvoie-la dans variantLabel en recopiant exactement son libelle. Sinon laisse variantLabel a null.",
    "",
    "Pour type product et product_detail_from_list, tu dois aussi indiquer si le client a explicitement demande le prix ou une information detaillee sur le produit:",
    "- wantsPrice: true uniquement si le message du client demande explicitement le prix, le tarif, le cout, ou combien ca coute. Sinon false. Ne mets jamais true par defaut: le prix ne doit pas etre donne spontanement si le client ne l'a pas demande.",
    "- wantsDescription: true si le client demande des details, plus d'informations, une description, ou pose une question sur les caracteristiques du produit (matiere, composition, notes olfactives, etc). Sinon false.",
    "",
    "- type product_list: la demande vise une categorie ou un type de produit de maniere large ou avec un critere de filtrage (par exemple: un parfum en particulier avec une caracteristique comme fruite/boise/leger, un type d'article dans un catalogue qui contient plusieurs produits similaires), et PLUSIEURS produits du catalogue correspondent raisonnablement. Retourne productIds: une liste de 3 a 5 identifiants de produits parmi les plus pertinents, en te basant sur le nom et surtout la description de chaque produit pour juger de la pertinence du filtrage demande (par exemple fruite, boise, leger, etc). Si moins de 3 produits pertinents existent, retourne uniquement ceux qui sont vraiment pertinents.",
    "",
    "- type clarify: la demande exprime une intention d'achat ou de recherche mais reste trop vague pour cibler un produit ou une liste pertinente (par exemple le client dit seulement je cherche un parfum, sans aucun autre critere, et le catalogue contient plusieurs parfums varies). Retourne clarifyingQuestion: une courte question naturelle et polie pour affiner la recherche (par exemple demander le type de parfum recherche, fruite, boise, floral, etc, en te basant sur les descriptions des produits disponibles dans le catalogue pour proposer des pistes pertinentes). N'utilise ce type que si une clarification aiderait reellement a affiner un choix parmi plusieurs options.",
    "",
    "- type product_detail_from_list: le message precedent du robot (visible dans l'historique de conversation) a propose une liste de plusieurs produits, et le client demande maintenant plus d'informations sur l'un d'entre eux (par exemple donne-moi plus d'infos sur le deuxieme, ou en me citant son nom). Utilise lastProposedProducts pour identifier lequel des produits recemment proposes est vise, et retourne son identifiant dans productId. Pour ce type, mets wantsDescription a true (le client demande explicitement plus d'informations). Ne mets wantsPrice a true que si le client demande aussi explicitement le prix.",
    "",
    "- type catalog: la demande vise un type d'article ou de rayon general correspondant a un catalogue entier plutot qu'a un produit precis (par exemple avez-vous des portemonnaie, ou le client demande un type d'article generique sans viser un produit specifique et qu'aucun produit individuel ne correspond mieux). Retourne l'identifiant canonique de ce catalogue dans catalogId.",
    "",
    "- type location: la demande vise un rayon, un service ou un lieu general qui n'est ni un produit ni un catalogue de produits. Retourne locationId.",
    "",
    "- type store_info: la demande correspond a une information generale du magasin (horaires, contact, evenements...). Retourne storeInfoId.",
    "",
    "- type general: la demande est generale ou conversationnelle et ne vise clairement ni un lieu, ni un produit, ni un catalogue, ni une information magasin.",
    "",
    "- type none: la demande semble viser un lieu, un produit, un catalogue ou une information du magasin mais aucune correspondance fiable n'existe.",
    "",
    "Les equivalences de sens, les abreviations, les formulations polies, les fautes, les variantes de langues et les traductions implicites doivent etre comprises.",
    "Exemples de meme sens: toilettes, wc, bathroom, restroom, bano, aseos.",
    "Si la demande est une question de localisation ou de recherche, ne retourne jamais type general.",
    "Reponds uniquement en JSON valide sans markdown.",
    "Format exact attendu:",
    "{\"type\":\"location|store_info|product|product_list|clarify|product_detail_from_list|catalog|general|none\",\"locationId\":\"id ou null\",\"storeInfoId\":\"id ou null\",\"productId\":\"id ou null\",\"productIds\":[\"id\",\"...\"],\"catalogId\":\"id ou null\",\"variantLabel\":\"libelle exact de la variante ou null\",\"wantsPrice\":true|false,\"wantsDescription\":true|false,\"clarifyingQuestion\":\"question ou null\",\"reason\":\"courte explication\"}"
  ].join(" ");

  const userPrompt = JSON.stringify(
    {
      customerLanguage: language || "fr",
      customerMessage: message,
      conversationHistory: recentHistory,
      lastProposedProducts: lastProposedProductCandidates,
      catalog: {
        locations: locationCandidates,
        storeInformation: storeInfoCandidates,
        products: productCandidates,
        catalogs: catalogCandidates
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
                enum: [
                  "location",
                  "store_info",
                  "product",
                  "product_list",
                  "clarify",
                  "product_detail_from_list",
                  "catalog",
                  "general",
                  "none"
                ]
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
              productId: {
                anyOf: [
                  { type: "string" },
                  { type: "null" }
                ]
              },
              productIds: {
                type: "array",
                items: { type: "string" }
              },
              catalogId: {
                anyOf: [
                  { type: "string" },
                  { type: "null" }
                ]
              },
              variantLabel: {
                anyOf: [
                  { type: "string" },
                  { type: "null" }
                ]
              },
              wantsPrice: {
                type: "boolean"
              },
              wantsDescription: {
                type: "boolean"
              },
              clarifyingQuestion: {
                anyOf: [
                  { type: "string" },
                  { type: "null" }
                ]
              },
              reason: {
                type: "string"
              }
            },
            required: [
              "type",
              "locationId",
              "storeInfoId",
              "productId",
              "productIds",
              "catalogId",
              "variantLabel",
              "wantsPrice",
              "wantsDescription",
              "clarifyingQuestion",
              "reason"
            ]
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
