import { config } from "./config.js";

const embeddingCache = new Map();

// Identite de la marque actuellement servie par ce robot.
// TODO(multi-marque): a terme, ces champs viendront d'une table brand_settings
// configurable depuis le backoffice plutot que d'etre codes en dur ici.
const brandProfile = {
  name: "The Estée Lauder Companies (ELC)",
  shortName: "Estée Lauder",
  description:
    "The Estée Lauder Companies (ELC) est un leader mondial dans la beaute de luxe. " +
    "ELC fabrique, commercialise et vend des produits de soins de la peau, de maquillage, " +
    "de parfums et de soins capillaires, et fait figure de representant des marques de luxe " +
    "et de prestige remarquables a l'echelle mondiale. Motivee par un esprit de creativite et " +
    "d'innovation, et un desir d'avoir un impact positif sur ses communautes, ELC s'efforce de " +
    "creer un monde qui n'est pas seulement beau, mais riche en possibilites.",
  moreInfoUrl: "https://www.elcompanies.com/fr/who-we-are/about-us"
};

function buildBrandIdentityText() {
  return (
    `Tu representes la marque ${brandProfile.name}. ${brandProfile.description} ` +
    "Cette identite de marque est une connaissance de fond: tu ne la mentionnes, ne te presentes " +
    "sous ce nom et ne cites cette description QUE si le client te demande explicitement qui tu es, " +
    "quelle est la marque ou l'entreprise, ou des informations sur la societe. " +
    "Dans toutes les autres reponses, tu n'evoques pas le nom de la marque et tu restes concentre " +
    "sur la demande du client."
  );
}

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
    buildBrandIdentityText(),
    "Ton ton est poli, fluide, sobre, chaleureux et professionnel.",
    "Tu parles comme un accueil haut de gamme, sans etre froid ni trop familier.",
    "Tu reponds pour l'oral, avec des phrases courtes, claires et naturelles.",
    "Tu n'utilises ni markdown, ni listes, ni emojis.",
    `Tu reponds uniquement dans la langue demandee: ${targetLanguage}.`,
    "Ton role premier est de guider physiquement le client vers ce qu'il cherche (produit, rayon, service), pas de lui recite des informations. Des qu'un lieu ou un produit demande est identifie et qu'un accompagnement est possible, ta priorite est de le proposer, pas de detailler des caracteristiques.",
    "Tu ne donnes une information detaillee (description, caracteristiques, prix) que si le client la demande explicitement. Si le client demande seulement ou se trouve quelque chose, tu ne donnes que l'emplacement et la proposition de guidage, sans ajouter de details non demandes.",
    "Tu ne parles jamais de produits, tu ne cites aucun nom de produit et tu ne fais aucune suggestion ou recommandation de produit de ta propre initiative.",
    "Tu n'evoques un produit que si le client a explicitement demande un produit precis, une categorie de produits, ou une liste de produits disponibles.",
    "Si le message du client ne concerne pas un produit (salutation, question sur un lieu, un horaire, un service), tu ne mentionnes aucun produit meme si le contexte en contient.",
    "Tu n'inventes jamais un emplacement, un horaire, un stock ou un service.",
    "Si l'information n'existe pas dans le contexte, tu dis simplement que tu ne sais pas ou tu demandes une precision.",
    "Tu ne proposes d'accompagner le client que si un point robot disponible est explicitement fourni pour ce lieu.",
    "Si aucun point robot n'est disponible pour ce lieu, tu donnes seulement l'information sans proposer d'accompagnement.",
    "Quand un point robot existe pour le lieu demande, tu proposes systematiquement de l'y emmener en terminant ta reponse par une proposition simple du type: Souhaitez-vous que je vous y emmene ?",
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

export async function createCatalogInfoReply({ name, description, language }) {
  const targetLanguage = language || "fr";

  if (!config.openAiApiKey) {
    return null;
  }

  const systemPrompt = [
    "Tu es la voix d'un robot d'accueil installe dans une boutique de luxe.",
    "Ton ton est poli, fluide, sobre, chaleureux et professionnel.",
    "Tu reponds pour l'oral, avec une ou deux phrases courtes, claires et naturelles.",
    "Tu n'utilises jamais de markdown, de puces, de listes a la ligne ni d'emojis: uniquement du texte courant, fluide, en phrases.",
    `Tu reponds uniquement dans la langue demandee: ${targetLanguage}.`,
    "On te donne le nom brut d'une categorie de produits issu d'une base de donnees, et sa description brute qui peut contenir une liste de sous-categories.",
    "Tu dois reformuler cette description brute en une ou deux phrases naturelles qui expliquent au client ce que contient cette categorie, comme le ferait un vendeur a l'oral.",
    "Tu peux citer quelques exemples marquants issus de la description pour illustrer, sans recopier la liste telle quelle ni en faire une enumeration exhaustive.",
    "Tu n'inventes jamais d'information qui n'est pas fournie dans la description.",
    "Tu ne proposes jamais d'accompagnement ou de guidage dans cette reponse: le client demande une explication, pas un emplacement.",
    "Exemple attendu: Le Haircare regroupe tous nos soins pour les cheveux, des shampoings aux masques en passant par les huiles et les produits coiffants."
  ].join(" ");

  const userPayload = JSON.stringify({
    nomBrut: name,
    descriptionBrute: description,
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
  lastProposedProducts,
  awaitingFirstName
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

  const lastProposedProductCandidates = (lastProposedProducts || []).map((product, index) => ({
    id: String(product.id),
    displayPosition: index + 1,
    name: product.name
  }));

  const systemPrompt = [
    "Tu aides un backend a comprendre une demande client dans n'importe quelle langue actuelle ou future, dans le cadre d'une conversation qui peut se derouler sur plusieurs messages.",
    "Le catalogue est dynamique et vient d'un backoffice. Il contient des catalogues (regroupements de produits, ex: Maroquinerie, Fragrance), des produits individuels, des lieux et des informations magasin.",
    "Tu dois faire une resolution semantique robuste entre la demande et le catalogue, meme si la demande et les donnees ne sont pas dans la meme langue.",
    "Tu dois raisonner sur le sens, pas sur des mots exacts.",
    "Tu dois choisir uniquement parmi les candidats fournis.",
    "Tu ne dois jamais inventer un identifiant, un lieu, un produit, un catalogue ou une information qui n'existe pas dans le catalogue fourni.",
    "Tu ne dois jamais proposer de produit de ta propre initiative: un type product, product_list, product_detail_from_list ou catalog n'est legitime que si le client a lui-meme exprime une recherche ou une question a propos d'un produit ou d'une categorie de produits. Si le message ne concerne pas un produit, n'utilise jamais ces types meme si des produits pertinents existent dans le catalogue.",
    "Ne melange jamais des produits de categories differentes dans une meme reponse: si le client demande un type de produit precis (par exemple un parfum), tous les produits consideres ou proposes doivent appartenir a cette meme categorie, jamais a une autre (par exemple jamais de maquillage ou de soin quand un parfum est demande).",
    "Principe general de priorite: le role premier du robot est de guider physiquement le client vers l'endroit ou se trouve ce qu'il cherche (produit, rayon, service), pas de lui donner des informations detaillees. Des qu'un produit, un rayon ou un catalogue est identifie, l'objectif par defaut est de permettre au robot de proposer de l'y emmener. Les informations complementaires (description, caracteristiques, prix) ne doivent etre fournies que si le client les demande explicitement: ne les considere jamais comme l'objectif principal de la reponse.",
    "",
    "Voici les types de reponse possibles et quand les utiliser:",
    "",
    awaitingFirstName
      ? "- type person_name: LE ROBOT VIENT DE DEMANDER AU CLIENT COMMENT IL S'APPELLE et attend sa reponse. Si le message du client est ou contient un prenom ou un nom de personne plausible (par exemple une simple presentation comme Marine, ou une phrase comme je m'appelle Marine, moi c'est Paul, my name is John), utilise ce type et retourne ce prenom ou nom dans personName, avec la casse correcte (premiere lettre en majuscule). Priorise toujours cette interpretation par defaut pour un message court qui ressemble a un prenom ou un nom propre, meme s'il ressemble aussi phonetiquement ou semantiquement a un nom de produit, une marque ou un mot du catalogue: dans le doute entre un prenom et un produit pour un message de ce type, choisis person_name. N'utilise PAS ce type si le message est clairement une question, une demande de produit explicite, une demande de lieu, ou toute autre phrase qui n'est manifestement pas une reponse a la question du prenom (par exemple une phrase longue, une question, une negation comme non merci)."
      : null,
    "",
    "- type product: la demande vise un produit precis et identifiable (le client connait deja le nom du produit, ou un seul produit correspond clairement). Retourne productId. Chaque produit peut avoir plusieurs variantes (par exemple des contenances differentes comme 100ml, 200ml, 500ml), chacune avec son propre prix. Si la demande precise une variante particuliere, identifie exactement quelle variante parmi availableVariants correspond et renvoie-la dans variantLabel en recopiant exactement son libelle. Sinon laisse variantLabel a null.",
    "",
    "Pour type product et product_detail_from_list, tu dois aussi indiquer si le client a explicitement demande le prix ou une information detaillee sur le produit:",
    "- wantsPrice: true uniquement si le message du client demande explicitement le prix, le tarif, le cout, ou combien ca coute. Sinon false. Ne mets jamais true par defaut: le prix ne doit pas etre donne spontanement si le client ne l'a pas demande.",
    "- wantsDescription: true si le client demande des details, plus d'informations, une description, ou pose une question sur les caracteristiques du produit (matiere, composition, notes olfactives, etc). Sinon false.",
    "",
    "- type product_list: la demande vise EXPLICITEMENT plusieurs produits. Deux cas declenchent ce type: (1) le client demande une liste, plusieurs options, des alternatives, des produits similaires a un produit deja cite, ou pose une question avec un critere de filtrage clair (par exemple un parfum boise, un rouge a levres mat); (2) le client demande explicitement de voir, connaitre, ou qu'on lui parle de tous les produits disponibles d'une categorie entiere, meme sans critere de filtrage (par exemple parle-moi des parfums disponibles, montre-moi vos parfums, quels parfums avez-vous, qu'est-ce que vous avez comme parfums): dans ce cas, le client ne demande pas d'aide pour choisir, il demande directement la liste, donc n'utilise JAMAIS type clarify pour ce cas precis. Retourne productIds: une liste de 3 a 5 identifiants de produits parmi les plus pertinents, en te basant sur le nom et surtout la description de chaque produit pour juger de la pertinence. Si moins de 3 produits pertinents existent, retourne uniquement ceux qui sont vraiment pertinents. IMPORTANT: tous les produits retournes doivent appartenir a la meme categorie/le meme type de produit que celui demande par le client (par exemple si le client demande des parfums, ne retourne jamais de maquillage ou de soin de la peau, meme si ces produits existent dans le catalogue). Si le client demande explicitement un seul produit ou le meilleur produit pour un besoin precis, n'utilise pas ce type: utilise type product avec un seul choix, ou type clarify si le choix n'est pas evident parmi les options.",
    "",
    "- type product_list_more: le message precedent du robot (visible dans l'historique) a propose une liste de plusieurs produits (voir lastProposedProducts), et le client demande maintenant s'il y en a d'autres, si c'est tout ce qui existe, ou plus d'options dans la meme categorie (par exemple vous avez que ca, c'est tout, autre chose, vous n'avez rien d'autre, montre m'en d'autres). N'utilise ce type QUE dans ce contexte precis de relance apres une liste deja proposee. Ne retourne aucun productIds toi-meme pour ce type: le backend calculera lui-meme les produits suivants a proposer.",
    "",
    "- type clarify: la demande exprime seulement une intention d'achat ou de recherche generale, SANS preciser quelle categorie de produits interesse le client (par exemple je cherche un produit, je ne sais pas ce que je veux, j'ai besoin de quelque chose). N'utilise CE type QUE si le client n'a encore nomme aucune categorie de produits precise: des qu'une categorie est nommee ou clairement identifiable (par exemple parfum, maquillage, soin), n'utilise jamais type clarify, utilise plutot type product_list ou type catalog selon la demande. Tu ne dois JAMAIS rediger toi-meme le texte de la question de clarification (aucune categorie, aucun rayon, aucun type de produit ne doit etre invente en texte libre). A la place, retourne clarifyingCatalogIds: une liste de 2 a 5 identifiants de catalogues, choisis UNIQUEMENT parmi les ids presents dans catalog.catalogs fourni en contexte, qui representent les pistes les plus pertinentes pour aider le client a preciser sa recherche. Si aucun catalogue fourni n'est pertinent, retourne une liste vide.",
    "",
    "- type product_detail_from_list: le message precedent du robot (visible dans l'historique de conversation) a propose une liste de plusieurs produits, et le client demande maintenant plus d'informations sur l'un d'entre eux. Utilise lastProposedProducts pour identifier lequel des produits recemment proposes est vise, et retourne son identifiant dans productId. Le client peut designer le produit de deux facons: (1) par son nom ou une partie reconnaissable de son nom (par exemple le nom du produit ou un mot cle distinctif qui le composent), auquel cas tu compares avec le champ name de chaque element de lastProposedProducts; (2) par sa position d'affichage, en citant un numero ou un ordinal (le numero 1, le 1, le premier, le deuxieme, the second one, etc). IMPORTANT: chaque produit affiche a l'ecran du client porte un badge visible correspondant exactement au champ displayPosition de cet element dans lastProposedProducts (le produit avec displayPosition 1 affiche #1, celui avec displayPosition 2 affiche #2, etc). Un numero ou un ordinal cite par le client (le numero 1, le premier, etc) fait donc TOUJOURS reference au champ displayPosition, JAMAIS au champ id (le champ id est un identifiant interne non visible du client, qui peut etre completement different du numero affiche: par exemple le produit avec id 10 peut tres bien avoir displayPosition 1 et afficher le badge #1). Ne compare donc jamais un numero cite par le client au champ id: compare-le uniquement au champ displayPosition. Pour ce type, mets wantsDescription a true (le client demande explicitement plus d'informations). Ne mets wantsPrice a true que si le client demande aussi explicitement le prix.",
    "",
    "- type catalog: la demande vise un type d'article ou de rayon general correspondant a un catalogue entier plutot qu'a un produit precis, ET le catalogue ne contient PAS plusieurs produits nettement differents parmi lesquels il faudrait choisir (le catalogue ne propose alors qu'un choix limite et homogene). Retourne l'identifiant canonique de ce catalogue dans catalogId: ce doit etre obligatoirement un id present parmi les catalogues fournis dans le contexte, jamais un catalogue invente. IMPORTANT: si le catalogue correspondant contient plusieurs produits clairement distincts (par exemple plusieurs parfums avec des noms et notes olfactives differentes), n'utilise JAMAIS type catalog pour une demande generique comme je cherche des parfums ou je voudrais un parfum: utilise plutot type clarify (si aucun critere n'est donne) ou type product_list (si un critere de filtrage est donne). Le type catalog ne doit jamais se substituer a la decouverte de produits: ne propose jamais de guider directement le client vers un rayon quand plusieurs produits differents pourraient l'interesser sans qu'il ait encore precise lequel. IMPORTANT: n'utilise type catalog QUE si la demande vise a trouver ou obtenir ce type de produit (je cherche, avez-vous, ou se trouve, je voudrais). Si la demande porte sur la nature ou la definition du catalogue lui-meme (par exemple qu'est-ce que X, c'est quoi X, ca sert a quoi), utilise le type catalog_info a la place, jamais type catalog.",
    "",
    "- type catalog_info: la demande porte sur la nature, la definition ou la description d'un catalogue ou d'une categorie de produits, sans chercher a etre guide vers cette categorie (par exemple qu'est-ce que le Haircare, c'est quoi le Skincare, ca comprend quoi). Retourne l'identifiant du catalogue concerne dans catalogId (obligatoirement un id present parmi les catalogues fournis). Ce type ne declenche jamais de proposition de guidage: le client demande une explication, pas un emplacement.",
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
    "{\"type\":\"person_name|location|store_info|product|product_list|product_list_more|clarify|product_detail_from_list|catalog|catalog_info|general|none\",\"personName\":\"prenom ou nom ou null\",\"locationId\":\"id ou null\",\"storeInfoId\":\"id ou null\",\"productId\":\"id ou null\",\"productIds\":[\"id\",\"...\"],\"catalogId\":\"id ou null\",\"clarifyingCatalogIds\":[\"id\",\"...\"],\"variantLabel\":\"libelle exact de la variante ou null\",\"wantsPrice\":true|false,\"wantsDescription\":true|false,\"reason\":\"courte explication\"}"
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
                  "person_name",
                  "location",
                  "store_info",
                  "product",
                  "product_list",
                  "product_list_more",
                  "clarify",
                  "product_detail_from_list",
                  "catalog",
                  "catalog_info",
                  "general",
                  "none"
                ]
              },
              personName: {
                anyOf: [
                  { type: "string" },
                  { type: "null" }
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
              clarifyingCatalogIds: {
                type: "array",
                items: { type: "string" }
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
              reason: {
                type: "string"
              }
            },
            required: [
              "type",
              "personName",
              "locationId",
              "storeInfoId",
              "productId",
              "productIds",
              "catalogId",
              "clarifyingCatalogIds",
              "variantLabel",
              "wantsPrice",
              "wantsDescription",
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
