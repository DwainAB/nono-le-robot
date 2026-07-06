import crypto from "node:crypto";
import { createAssistantReply, createLocationReply, resolveCatalogMatch } from "./openai-chat.js";
import {
  buildLocationContextText,
  buildStoreInformationContextText,
  findLocationFromMessage,
  findStoreInformationFromMessage,
  listKnownLocations,
  listStoreInformation
} from "./store-map.js";
import {
  buildCatalogContextText,
  findProductFromMessage,
  listCatalogs,
  listProducts,
  matchVariantFromMessage
} from "./catalog-service.js";

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const sessions = new Map();
function getSession(sessionId) {
  const resolvedSessionId = sessionId || crypto.randomUUID();
  if (!sessions.has(resolvedSessionId)) {
    sessions.set(resolvedSessionId, {
      history: [],
      firstName: null,
      lastProposedProducts: []
    });
  }
  return {
    sessionId: resolvedSessionId,
    session: sessions.get(resolvedSessionId)
  };
}

function pushHistory(sessionId, role, content) {
  const session = sessions.get(sessionId) || { history: [], firstName: null, lastProposedProducts: [] };
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
  const session = sessions.get(sessionId) || { history: [], firstName: null, lastProposedProducts: [] };
  sessions.set(sessionId, {
    ...session,
    firstName
  });
}

function updateLastProposedProducts(sessionId, products) {
  const session = sessions.get(sessionId) || { history: [], firstName: null, lastProposedProducts: [] };
  sessions.set(sessionId, {
    ...session,
    lastProposedProducts: products
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
    /(?:me llamo|mi nombre es|soy)\s+([a-zA-ZÀ-ÿ' -]+)/i,
    /(?:меня зовут|я)\s+([а-яёА-ЯЁ' -]+)/i,
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
  if (value.startsWith("es")) return "es";
  if (value.startsWith("ru")) return "ru";
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

function localizeItemName(item, language) {
  if (!item) {
    return null;
  }
  return item.labels?.[language]?.name || item.name;
}

function buildGreetingWithFirstName(firstName, language) {
  switch (normalizeLanguage(language)) {
    case "en":
      return "Hello, how can I help you?";
    case "es":
      return "Hola, ¿en qué puedo ayudarle?";
    case "ru":
      return "Здравствуйте, чем я могу вам помочь?";
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
  const primaryInfo =
    location.labels?.[resolvedLanguage]?.details ||
    location.labels?.[resolvedLanguage]?.description ||
    location.labels?.[resolvedLanguage]?.zone ||
    location.details ||
    location.description ||
    location.zone ||
    location.floorLabel ||
    "";

  if (!primaryInfo) {
    switch (resolvedLanguage) {
      case "en":
        return "this place";
      case "es":
        return "este lugar";
      case "ru":
        return "это место";
      case "zh":
        return "这个位置";
      case "ar":
        return "هذا المكان";
      case "fr":
      default:
        return "cet endroit";
    }
  }

  return primaryInfo;
}

function buildLocationReplyFallback(subject, place, resolvedLanguage, canNavigate) {
  switch (resolvedLanguage) {
    case "en":
      return canNavigate
        ? `You can find ${subject} at ${place}. I can take you there if you want.`
        : `You can find ${subject} at ${place}.`;
    case "es":
      return canNavigate
        ? `Puede encontrar ${subject} en ${place}. Puedo acompañarle hasta allí si lo desea.`
        : `Puede encontrar ${subject} en ${place}.`;
    case "ru":
      return canNavigate
        ? `${subject} находится здесь: ${place}. Я могу вас туда проводить, если хотите.`
        : `${subject} находится здесь: ${place}.`;
    case "zh":
      return canNavigate
        ? `您可以在${place}找到${subject}。如果您愿意，我可以带您过去。`
        : `您可以在${place}找到${subject}。`;
    case "ar":
      return canNavigate
        ? `يمكنك العثور على ${subject} في ${place}. يمكنني أن آخذك إليها إذا أردت.`
        : `يمكنك العثور على ${subject} في ${place}.`;
    case "fr":
    default:
      return canNavigate
        ? `Vous trouverez ${subject} à ${place}. Je peux vous y guider si vous voulez.`
        : `Vous trouverez ${subject} à ${place}.`;
  }
}

async function buildLocationReplyText(match, language, canNavigate) {
  const resolvedLanguage = normalizeLanguage(language);
  const location = match.location;
  const subject =
    localizeItemName(match.item, resolvedLanguage) ||
    match.itemName ||
    localizeLocationName(location, resolvedLanguage);
  const place = buildPlaceDescription(location, resolvedLanguage);

  try {
    const reply = await createLocationReply({
      subject,
      place,
      language: resolvedLanguage,
      canNavigate
    });
    if (reply) {
      return reply;
    }
  } catch {
    // fall through to the fixed template below
  }

  return buildLocationReplyFallback(subject, place, resolvedLanguage, canNavigate);
}

function buildLocationReply(match, language) {
  return buildLocationReplyText(match, language, true);
}

function buildLocationOnlyReply(match, language) {
  return buildLocationReplyText(match, language, false);
}

function findLocationByAiResolution(allLocations, aiResolution) {
  if (!aiResolution || aiResolution.type !== "location" || !aiResolution.locationId) {
    return null;
  }

  const normalizedTarget = String(aiResolution.locationId || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  return allLocations.find((location) => {
    const candidates = [
      location.id,
      location.name,
      location.externalRobotId,
      location.slug,
      ...Object.values(location.labels || {}).map((label) => label?.name),
      ...(location.aliases || [])
    ]
      .map((candidate) =>
        String(candidate || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim()
      )
      .filter(Boolean);
    return candidates.includes(normalizedTarget);
  });
}

function findStoreInformationByAiResolution(allStoreInformation, aiResolution) {
  if (!aiResolution || aiResolution.type !== "store_info" || !aiResolution.storeInfoId) {
    return [];
  }

  const normalizedTarget = String(aiResolution.storeInfoId || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  return (allStoreInformation || []).filter((entry) => {
    const candidates = [
      entry.id,
      entry.slug,
      entry.title,
      ...Object.values(entry.labels || {}).flatMap((label) => [label?.title, label?.value])
    ]
      .map((candidate) =>
        String(candidate || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim()
      )
      .filter(Boolean);

    return candidates.includes(normalizedTarget);
  });
}

function findProductByAiResolution(allProducts, aiResolution) {
  if (!aiResolution || aiResolution.type !== "product" || !aiResolution.productId) {
    return null;
  }

  const normalizedTarget = String(aiResolution.productId || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  return (allProducts || []).find((product) => {
    const candidates = [
      product.id,
      product.slug,
      product.name,
      ...Object.values(product.labels || {}).map((label) => label?.name),
      ...(product.aliases || [])
    ]
      .map((candidate) =>
        String(candidate || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim()
      )
      .filter(Boolean);
    return candidates.includes(normalizedTarget);
  });
}

function findCatalogByAiResolution(allCatalogs, aiResolution) {
  if (!aiResolution || aiResolution.type !== "catalog" || !aiResolution.catalogId) {
    return null;
  }

  const normalizedTarget = String(aiResolution.catalogId || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  return (allCatalogs || []).find((catalog) => {
    const candidates = [
      catalog.id,
      catalog.slug,
      catalog.name,
      ...Object.values(catalog.labels || {}).map((label) => label?.name),
      ...(catalog.aliases || [])
    ]
      .map((candidate) =>
        String(candidate || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim()
      )
      .filter(Boolean);
    return candidates.includes(normalizedTarget);
  });
}

function pickBestCatalogForProduct(product) {
  const catalogs = Array.isArray(product?.catalogs) ? product.catalogs : [];
  return catalogs.slice().sort((left, right) => (left.priority || 0) - (right.priority || 0))[0] || null;
}

function findBestLocationForProduct(product, allCatalogs) {
  const bestCatalogRef = pickBestCatalogForProduct(product);
  if (!bestCatalogRef) {
    return null;
  }
  const fullCatalog = (allCatalogs || []).find((catalog) => catalog.id === bestCatalogRef.id) || null;
  return fullCatalog?.locations?.slice().sort((left, right) => left.priority - right.priority)[0] || null;
}

function formatPrice(price, currency, language) {
  if (price === null || price === undefined) {
    return null;
  }

  try {
    return new Intl.NumberFormat(normalizeLanguage(language) === "fr" ? "fr-FR" : normalizeLanguage(language), {
      style: "currency",
      currency: currency || "EUR"
    }).format(price);
  } catch {
    return `${price} ${currency || "EUR"}`;
  }
}

function cheapestVariant(variants) {
  return (variants || []).slice().sort((left, right) => left.price - right.price)[0] || null;
}

function buildVariantPriceText(product, selectedVariant, language) {
  const resolvedLanguage = normalizeLanguage(language);
  const variants = product.variants || [];

  if (selectedVariant) {
    return `${selectedVariant.label} : ${formatPrice(selectedVariant.price, selectedVariant.currency, resolvedLanguage)}`;
  }

  if (variants.length === 1) {
    return formatPrice(variants[0].price, variants[0].currency, resolvedLanguage);
  }

  if (variants.length > 1) {
    const cheapest = cheapestVariant(variants);
    const startingFromText = formatPrice(cheapest.price, cheapest.currency, resolvedLanguage);
    const allVariantsText = variants
      .map((variant) => `${variant.label} : ${formatPrice(variant.price, variant.currency, resolvedLanguage)}`)
      .join(", ");

    switch (resolvedLanguage) {
      case "en":
        return `from ${startingFromText} (${allVariantsText})`;
      case "es":
        return `desde ${startingFromText} (${allVariantsText})`;
      case "ru":
        return `от ${startingFromText} (${allVariantsText})`;
      case "zh":
        return `${startingFromText}起 (${allVariantsText})`;
      case "ar":
        return `ابتداءً من ${startingFromText} (${allVariantsText})`;
      case "fr":
      default:
        return `a partir de ${startingFromText} (${allVariantsText})`;
    }
  }

  return null;
}

function buildProductReplyFallback({ product, variant, location, language }) {
  const resolvedLanguage = normalizeLanguage(language);
  const name = product.labels?.[resolvedLanguage]?.name || product.name;
  const description = product.labels?.[resolvedLanguage]?.description || product.description;
  const priceText = buildVariantPriceText(product, variant, resolvedLanguage);
  const locationName = location ? location.name : null;

  const parts = [name];
  if (description) parts.push(description);
  if (priceText) parts.push(priceText);

  const intro = parts.join(" - ");

  if (!locationName) {
    return intro;
  }

  switch (resolvedLanguage) {
    case "en":
      return `${intro}. You can find it at ${locationName}. Would you like me to guide you there?`;
    case "es":
      return `${intro}. Puede encontrarlo en ${locationName}. ¿Quiere que le acompañe hasta allí?`;
    case "ru":
      return `${intro}. Вы найдёте это здесь: ${locationName}. Проводить вас туда?`;
    case "zh":
      return `${intro}。您可以在${locationName}找到它。需要我带您过去吗？`;
    case "ar":
      return `${intro}. يمكنك إيجاده في ${locationName}. هل تريد أن أرافقك إلى هناك؟`;
    case "fr":
    default:
      return `${intro}. Vous le trouverez a ${locationName}. Souhaitez-vous que je vous y guide ?`;
  }
}

function buildProductListReply(products, language) {
  const resolvedLanguage = normalizeLanguage(language);
  const names = products.map((product) => product.labels?.[resolvedLanguage]?.name || product.name);
  const listText = names.join(", ");

  switch (resolvedLanguage) {
    case "en":
      return `Here are a few options that might interest you: ${listText}. Would you like more details on one of them?`;
    case "es":
      return `Aquí tiene algunas opciones que podrían interesarle: ${listText}. ¿Quiere más información sobre alguna?`;
    case "ru":
      return `Вот несколько вариантов, которые могут вас заинтересовать: ${listText}. Хотите узнать больше о каком-то из них?`;
    case "zh":
      return `这里有几款可能您会喜欢的产品：${listText}。需要了解某一款的更多信息吗？`;
    case "ar":
      return `إليك بعض الخيارات التي قد تعجبك: ${listText}. هل تريد مزيدًا من المعلومات عن أحدها؟`;
    case "fr":
    default:
      return `Voici une petite liste de nos produits qui pourrait vous plaire : ${listText}. Souhaitez-vous plus d'informations sur l'un d'entre eux ?`;
  }
}

function buildCatalogReplyText(catalog, location, language) {
  const resolvedLanguage = normalizeLanguage(language);
  const name = catalog.labels?.[resolvedLanguage]?.name || catalog.name;
  const locationName = location ? location.name : null;

  if (!locationName) {
    switch (resolvedLanguage) {
      case "en":
        return `Yes, we do have a ${name} selection.`;
      case "es":
        return `Sí, tenemos una selección de ${name}.`;
      case "ru":
        return `Да, у нас есть подборка: ${name}.`;
      case "zh":
        return `是的，我们有${name}系列。`;
      case "ar":
        return `نعم، لدينا تشكيلة من ${name}.`;
      case "fr":
      default:
        return `Oui, nous avons une selection de ${name}.`;
    }
  }

  switch (resolvedLanguage) {
    case "en":
      return `Yes, we do. You will find our ${name} selection at ${locationName}. Would you like me to guide you there?`;
    case "es":
      return `Sí, claro. Encontrará nuestra selección de ${name} en ${locationName}. ¿Quiere que le acompañe hasta allí?`;
    case "ru":
      return `Да, конечно. Подборку ${name} вы найдёте здесь: ${locationName}. Проводить вас туда?`;
    case "zh":
      return `当然有。我们的${name}系列在${locationName}。需要我带您过去吗？`;
    case "ar":
      return `بالتأكيد. ستجد تشكيلة ${name} في ${locationName}. هل تريد أن أرافقك إلى هناك؟`;
    case "fr":
    default:
      return `Bien sur, nous en avons. Ils se situent cote ${locationName}. Souhaitez-vous que je vous y accompagne ?`;
  }
}

function buildClarifyingReplyFallback(language) {
  switch (normalizeLanguage(language)) {
    case "en":
      return "Could you tell me a bit more about what you are looking for?";
    case "es":
      return "¿Podría decirme un poco más sobre lo que busca?";
    case "ru":
      return "Не могли бы вы уточнить, что именно вы ищете?";
    case "zh":
      return "能再具体说说您想找什么样的产品吗？";
    case "ar":
      return "هل يمكنك إخباري بمزيد من التفاصيل عمّا تبحث عنه؟";
    case "fr":
    default:
      return "Pourriez-vous m'en dire un peu plus sur ce que vous recherchez ?";
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
    const values = items
      .map((entry) => {
        const localizedTitle = entry.labels?.[resolvedLanguage]?.title || entry.title;
        const localizedValue = entry.labels?.[resolvedLanguage]?.value || entry.value;
        return `${localizedTitle}: ${localizedValue}`;
      })
      .join(" ; ");
    switch (resolvedLanguage) {
      case "en":
        return `Current events: ${values}.`;
      case "es":
        return `Eventos actuales: ${values}.`;
      case "ru":
        return `Текущие события: ${values}.`;
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
      return `${first.labels?.en?.title || first.title}: ${first.labels?.en?.value || first.value}.`;
    case "es":
      return `${first.labels?.es?.title || first.title}: ${first.labels?.es?.value || first.value}.`;
    case "ru":
      return `${first.labels?.ru?.title || first.title}: ${first.labels?.ru?.value || first.value}.`;
    case "zh":
      return `${first.labels?.zh?.title || first.title}：${first.labels?.zh?.value || first.value}。`;
    case "ar":
      return `${first.labels?.ar?.title || first.title}: ${first.labels?.ar?.value || first.value}.`;
    case "fr":
    default:
      return `${first.title} : ${first.value}.`;
  }
}

function buildUnknownLocationReply(language) {
  switch (normalizeLanguage(language)) {
    case "en":
      return "I do not know where it is at the moment.";
    case "es":
      return "No sé dónde está en este momento.";
    case "ru":
      return "Сейчас я не знаю, где это находится.";
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
    case "es":
      return "Hola, ¿en qué puedo ayudarle?";
    case "ru":
      return "Здравствуйте, чем я могу вам помочь?";
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
    es: [/donde esta/i, /dónde está/i, /donde estan/i, /dónde están/i, /busco/i, /quiero/i],
    ru: [/где/i, /ищу/i, /мне нужен/i, /мне нужна/i, /хочу/i],
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

  if (/bonjour|salut|hello|hi|hola|buenas|привет|здравствуйте|你好|您好|مرحبا|السلام/i.test(message)) {
    switch (resolvedLanguage) {
      case "en":
        return "Hello, how can I help you?";
      case "es":
        return "Hola, ¿en qué puedo ayudarle?";
      case "ru":
        return "Здравствуйте, чем я могу вам помочь?";
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
    case "es":
      return "Puedo ayudarle a encontrar un producto, una sección o un servicio de la tienda. Solo dígame qué está buscando.";
    case "ru":
      return "Я могу помочь вам найти товар, отдел или услугу в магазине. Просто скажите, что вы ищете.";
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

  console.log(
    "[handleChat] request",
    JSON.stringify({
      sessionId: sessionId || null,
      language,
      message: trimmedMessage,
      navigableLocationIds
    })
  );

  const session = getSession(sessionId);
  const history = session.session.history;
  const allLocations = await listKnownLocations();
  const allStoreInformation = await listStoreInformation();
  const allProducts = await listProducts();
  let matchedLocation = null;
  let matchedStoreInformation = [];
  let matchedProduct = null;
  let matchedProductList = null;
  let matchedCatalog = null;
  let clarifyingQuestion = null;
  const extractedFirstName = !session.session.firstName ? extractFirstName(trimmedMessage) : null;
  const resolvedLanguage = normalizeLanguage(language);
  const navigableSet = new Set(
    (Array.isArray(navigableLocationIds) ? navigableLocationIds : [])
      .map((item) => normalize(String(item)))
      .filter(Boolean)
  );
  const dbNavigableLocations = allLocations.filter(
    (item) => item.robotCanNavigate && item.isCurrentlyAvailable
  );
  const navigableLocations = navigableSet.size
    ? dbNavigableLocations.filter((item) => {
        const candidates = [
          item.id,
          item.slug,
          item.externalRobotId,
          item.name,
          ...(item.aliases || [])
        ]
          .map((candidate) => normalize(String(candidate || "")))
          .filter(Boolean);
        return candidates.some((candidate) => navigableSet.has(candidate));
      })
    : dbNavigableLocations;

  pushHistory(session.sessionId, "user", trimmedMessage);

  const allCatalogs = await listCatalogs();
  let aiResolution = null;
  try {
    aiResolution = await resolveCatalogMatch({
      message: trimmedMessage,
      language: resolvedLanguage,
      locations: allLocations,
      storeInformation: allStoreInformation,
      products: allProducts,
      catalogs: allCatalogs,
      history,
      lastProposedProducts: session.session.lastProposedProducts
    });
  } catch {
    aiResolution = null;
  }

  console.log(
    "[handleChat] postResolution",
    JSON.stringify({
      message: trimmedMessage,
      language: resolvedLanguage,
      aiResolution
    })
  );

  if (aiResolution?.type === "location") {
    const aiResolvedLocation = findLocationByAiResolution(allLocations, aiResolution);
    if (aiResolvedLocation) {
      matchedLocation = {
        type: "location",
        itemName: null,
        location: aiResolvedLocation
      };
    } else {
      aiResolution = { ...aiResolution, type: "none" };
    }
  } else if (aiResolution?.type === "store_info") {
    matchedStoreInformation = findStoreInformationByAiResolution(allStoreInformation, aiResolution);
    if (!matchedStoreInformation.length) {
      aiResolution = { ...aiResolution, type: "none" };
    }
  } else if (aiResolution?.type === "product" || aiResolution?.type === "product_detail_from_list") {
    const aiResolvedProduct = findProductByAiResolution(allProducts, {
      ...aiResolution,
      type: "product"
    });
    if (aiResolvedProduct) {
      const location = findBestLocationForProduct(aiResolvedProduct, allCatalogs);
      const variant = matchVariantFromMessage(aiResolution.variantLabel, aiResolvedProduct.variants);
      matchedProduct = { product: aiResolvedProduct, variant, location };
    } else {
      aiResolution = { ...aiResolution, type: "none" };
    }
  } else if (aiResolution?.type === "product_list") {
    const requestedIds = Array.isArray(aiResolution.productIds) ? aiResolution.productIds : [];
    matchedProductList = requestedIds
      .map((productId) => findProductByAiResolution(allProducts, { type: "product", productId }))
      .filter(Boolean)
      .slice(0, 5);
    if (!matchedProductList.length) {
      aiResolution = { ...aiResolution, type: "none" };
    }
  } else if (aiResolution?.type === "catalog") {
    const aiResolvedCatalog = findCatalogByAiResolution(allCatalogs, aiResolution);
    if (aiResolvedCatalog) {
      const location =
        aiResolvedCatalog.locations?.slice().sort((left, right) => left.priority - right.priority)[0] || null;
      matchedCatalog = { catalog: aiResolvedCatalog, location };
    } else {
      aiResolution = { ...aiResolution, type: "none" };
    }
  } else if (aiResolution?.type === "clarify") {
    clarifyingQuestion = aiResolution.clarifyingQuestion || buildClarifyingReplyFallback(resolvedLanguage);
  }

  if (!matchedLocation && !matchedStoreInformation.length && !matchedProduct && !aiResolution) {
    matchedLocation = await findLocationFromMessage(trimmedMessage);
    matchedStoreInformation = await findStoreInformationFromMessage(trimmedMessage);

    if (!matchedLocation && !matchedStoreInformation.length) {
      const productMatches = await findProductFromMessage(trimmedMessage, { limit: 1 });
      if (productMatches.length) {
        const product = productMatches[0].product;
        const variant = matchVariantFromMessage(trimmedMessage, product.variants);
        matchedProduct = { product, variant, location: productMatches[0].location };
      }
    }
  }

  let reply;
  let action = null;

  if (matchedLocation) {
    const locationNavigationCandidates = [
      matchedLocation.location.id,
      matchedLocation.location.slug,
      matchedLocation.location.externalRobotId,
      matchedLocation.location.name,
      ...(matchedLocation.location.aliases || [])
    ]
      .map((candidate) => normalize(String(candidate || "")))
      .filter(Boolean);

    const canNavigate =
      matchedLocation.location.robotCanNavigate &&
      matchedLocation.location.isCurrentlyAvailable &&
      (!navigableSet.size || locationNavigationCandidates.some((candidate) => navigableSet.has(candidate)));

    if (canNavigate) {
      reply = await buildLocationReply(matchedLocation, resolvedLanguage);
      action = {
        type: "navigate",
        destination: matchedLocation.location.zone || matchedLocation.location.name,
        locationId:
          matchedLocation.location.externalRobotId ||
          matchedLocation.location.slug ||
          matchedLocation.location.id
      };
    } else {
      reply = await buildLocationOnlyReply(matchedLocation, resolvedLanguage);
    }
  } else if (matchedProduct) {
    const location = matchedProduct.location;
    const locationNavigationCandidates = location
      ? [location.id, location.slug, location.externalRobotId, location.name]
          .map((candidate) => normalize(String(candidate || "")))
          .filter(Boolean)
      : [];

    const canNavigate =
      Boolean(location) &&
      location.robotCanNavigate &&
      location.isCurrentlyAvailable &&
      (!navigableSet.size || locationNavigationCandidates.some((candidate) => navigableSet.has(candidate)));

    reply = buildProductReplyFallback({
      product: matchedProduct.product,
      variant: matchedProduct.variant,
      location: canNavigate ? location : null,
      language: resolvedLanguage
    });

    action = {
      type: "product",
      product: {
        id: matchedProduct.product.id,
        name: matchedProduct.product.labels?.[resolvedLanguage]?.name || matchedProduct.product.name,
        description:
          matchedProduct.product.labels?.[resolvedLanguage]?.description || matchedProduct.product.description,
        imageUrl: matchedProduct.product.imageUrl,
        variants: (matchedProduct.product.variants || []).map((variant) => ({
          label: variant.label,
          price: variant.price,
          currency: variant.currency
        })),
        selectedVariant: matchedProduct.variant
          ? {
              label: matchedProduct.variant.label,
              price: matchedProduct.variant.price,
              currency: matchedProduct.variant.currency
            }
          : null
      },
      navigate: canNavigate
        ? {
            destination: location.zone || location.name,
            locationId: location.externalRobotId || location.slug || location.id
          }
        : null
    };
  } else if (matchedProductList) {
    reply = buildProductListReply(matchedProductList, resolvedLanguage);
    updateLastProposedProducts(session.sessionId, matchedProductList);

    action = {
      type: "product_list",
      products: matchedProductList.map((product) => ({
        id: product.id,
        name: product.labels?.[resolvedLanguage]?.name || product.name,
        description: product.labels?.[resolvedLanguage]?.description || product.description,
        imageUrl: product.imageUrl,
        variants: (product.variants || []).map((variant) => ({
          label: variant.label,
          price: variant.price,
          currency: variant.currency
        }))
      }))
    };
  } else if (matchedCatalog) {
    const location = matchedCatalog.location;
    const locationNavigationCandidates = location
      ? [location.id, location.slug, location.externalRobotId, location.name]
          .map((candidate) => normalize(String(candidate || "")))
          .filter(Boolean)
      : [];

    const canNavigate =
      Boolean(location) &&
      location.robotCanNavigate &&
      location.isCurrentlyAvailable &&
      (!navigableSet.size || locationNavigationCandidates.some((candidate) => navigableSet.has(candidate)));

    reply = buildCatalogReplyText(matchedCatalog.catalog, canNavigate ? location : null, resolvedLanguage);

    action = canNavigate
      ? {
          type: "navigate",
          destination: location.zone || location.name,
          locationId: location.externalRobotId || location.slug || location.id
        }
      : null;
  } else if (clarifyingQuestion) {
    reply = clarifyingQuestion;
  } else if (matchedStoreInformation.length) {
    reply = buildStoreInformationReply(matchedStoreInformation, resolvedLanguage);
  } else if (extractedFirstName) {
    updateFirstName(session.sessionId, extractedFirstName || trimmedMessage);
    reply = buildGenericHelpReply(resolvedLanguage);
  } else if (aiResolution?.type === "none") {
    reply = buildUnknownLocationReply(resolvedLanguage);
  } else {
    const locationNames = await buildLocationContextText(resolvedLanguage);
    const storeInformationContext = await buildStoreInformationContextText(resolvedLanguage);
    const catalogContext = await buildCatalogContextText(resolvedLanguage);
    const navigableContext = buildNavigableContext(resolvedLanguage, navigableLocations);

    reply =
      (await createAssistantReply({
        message: trimmedMessage,
        sessionId: session.sessionId,
        language: resolvedLanguage,
        history,
        locationContext: [locationNames, storeInformationContext, catalogContext].filter(Boolean).join(" ; "),
        navigableContext
      })) || buildFallbackReply(trimmedMessage, resolvedLanguage);
  }

  pushHistory(session.sessionId, "assistant", reply);

  console.log(
    "[handleChat] response",
    JSON.stringify({
      sessionId: session.sessionId,
      language: resolvedLanguage,
      message: trimmedMessage,
      reply,
      action
    })
  );

  return {
    sessionId: session.sessionId,
    reply,
    action
  };
}
