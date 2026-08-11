import { upsertCatalog, replaceCatalogProducts } from "../src/catalog-service.js";

const catalogs = [
  {
    slug: "fashion",
    name: "Fashion",
    description: "Vetements Louis Vuitton homme et femme",
    aliases: ["mode", "vetements", "pret-a-porter", "fashion"]
  },
  {
    slug: "fragrance",
    name: "Fragrance",
    description: "Parfums Louis Vuitton, collection Les Parfums",
    aliases: ["parfums", "parfum", "fragrance"]
  },
  {
    slug: "maroquinerie",
    name: "Maroquinerie",
    description: "Sacs a main, chaussures, ceintures, portefeuilles et accessoires Louis Vuitton",
    aliases: ["maroquinerie", "cuir", "accessoires"]
  },
  {
    slug: "voyage",
    name: "Voyage",
    description: "Malles de voyage, valises, sacs de voyage, sacs costume et boites a chapeau Louis Vuitton",
    aliases: ["voyage", "bagagerie", "bagages"]
  }
];

// Produits verifies reels et actuels au catalogue Louis Vuitton (recherche web du 2026-07-06).
// Pieces de pret-a-porter Fashion: LV ne nomme pas ses vetements de collection saisonniere
// avec un nom de modele fixe (contrairement aux sacs) -> descriptions generiques realistes.
const products = {
  fashion: [
    {
      name: "Chemise en lin – Homme",
      description: "Chemise en lin, collection pret-a-porter homme Louis Vuitton",
      aliases: ["chemise homme"],
      isNew: true,
      variants: [{ label: "Standard", price: 1250, currency: "EUR" }]
    },
    {
      name: "Cardigan Since 1854 Monogram – Homme",
      description: "Cardigan en maille avec motif Since 1854 Monogram, collection homme Louis Vuitton",
      aliases: ["cardigan homme"],
      isNew: false,
      variants: [{ label: "Standard", price: 1900, currency: "EUR" }]
    },
    {
      name: "Robe en soie Monogram – Femme",
      description: "Robe en soie imprimee Monogram, collection pret-a-porter femme Louis Vuitton",
      aliases: ["robe femme"],
      isNew: true,
      variants: [{ label: "Standard", price: 2900, currency: "EUR" }]
    },
    {
      name: "Manteau en laine – Femme",
      description: "Manteau en laine et cachemire, collection pret-a-porter femme Louis Vuitton",
      aliases: ["manteau femme"],
      isNew: true,
      variants: [{ label: "Standard", price: 4200, currency: "EUR" }]
    }
  ],
  fragrance: [
    {
      name: "Imagination",
      description: "Eau de Parfum pour homme, collection Les Parfums Louis Vuitton",
      aliases: ["parfum imagination", "parfum homme"],
      isNew: false,
      variants: [
        { label: "100ml", price: 250, currency: "EUR" },
        { label: "200ml", price: 380, currency: "EUR" }
      ]
    },
    {
      name: "Ombre Nomade",
      description: "Eau de Parfum mixte, boisee et fumee, collection Les Parfums Louis Vuitton",
      aliases: ["parfum ombre nomade"],
      isNew: false,
      variants: [
        { label: "100ml", price: 260, currency: "EUR" },
        { label: "200ml", price: 390, currency: "EUR" }
      ]
    },
    {
      name: "Attrape-Rêves",
      description: "Eau de Parfum pour femme, florale et fruitee, collection Les Parfums Louis Vuitton",
      aliases: ["parfum attrape reves", "parfum femme"],
      isNew: false,
      variants: [
        { label: "100ml", price: 250, currency: "EUR" },
        { label: "200ml", price: 380, currency: "EUR" }
      ]
    },
    {
      name: "Spell On You",
      description: "Eau de Parfum pour femme, florale, collection Les Parfums Louis Vuitton",
      aliases: ["parfum spell on you", "parfum femme"],
      isNew: false,
      variants: [
        { label: "100ml", price: 250, currency: "EUR" },
        { label: "200ml", price: 380, currency: "EUR" }
      ]
    },
    {
      name: "Fantasmagory",
      description: "Eau de Parfum vanillee au gingembre et amande, collection Les Parfums Louis Vuitton",
      aliases: ["parfum fantasmagory"],
      isNew: true,
      variants: [
        { label: "100ml", price: 260, currency: "EUR" },
        { label: "200ml", price: 390, currency: "EUR" }
      ]
    }
  ],
  maroquinerie: [
    {
      name: "Sac Neverfull",
      description: "Sac a main tote en toile Monogram",
      aliases: ["sac a main", "neverfull"],
      isNew: false,
      variants: [{ label: "MM", price: 1960, currency: "EUR" }]
    },
    {
      name: "Sac Speedy Bandouliere",
      description: "Sac a main en toile Monogram avec bandouliere amovible",
      aliases: ["sac a main", "speedy"],
      isNew: false,
      variants: [{ label: "25", price: 1750, currency: "EUR" }]
    },
    {
      name: "Run 55 Sneaker",
      description: "Sneakers avec LV Initiales sur le cote, homme et femme",
      aliases: ["chaussures", "sneakers", "baskets"],
      isNew: true,
      variants: [{ label: "Standard", price: 1150, currency: "EUR" }]
    },
    {
      name: "LV Trainer Sneaker",
      description: "Sneakers en denim Damier et cuir de veau lisse, cree par Virgil Abloh",
      aliases: ["chaussures", "sneakers", "LV trainer"],
      isNew: false,
      variants: [{ label: "Standard", price: 1200, currency: "EUR" }]
    },
    {
      name: "Ceinture LV Initiales 40mm",
      description: "Ceinture reversible avec boucle LV Initiales, homme",
      aliases: ["ceinture"],
      isNew: false,
      variants: [{ label: "Standard", price: 480, currency: "EUR" }]
    },
    {
      name: "Zippy Coin Purse Monogram",
      description: "Porte-monnaie zippe en toile Monogram",
      aliases: ["porte monnaie"],
      isNew: false,
      variants: [{ label: "Standard", price: 320, currency: "EUR" }]
    },
    {
      name: "Zippy Wallet Monogram",
      description: "Portefeuille zippe en toile Monogram",
      aliases: ["portefeuille"],
      isNew: false,
      variants: [{ label: "Standard", price: 720, currency: "EUR" }]
    },
    {
      name: "Bandeau en soie Monogram",
      description: "Accessoire cheveux en soie imprimee Monogram",
      aliases: ["accessoire", "bandeau"],
      isNew: true,
      variants: [{ label: "Standard", price: 250, currency: "EUR" }]
    }
  ],
  voyage: [
    {
      name: "Malle Bisten",
      description: "Malle de voyage rigide en toile Monogram",
      aliases: ["malle de voyage", "malle", "bisten"],
      isNew: false,
      variants: [{ label: "60", price: 24500, currency: "EUR" }]
    },
    {
      name: "Valise Horizon",
      description: "Valise rigide a roulettes en toile Monogram",
      aliases: ["valise", "horizon"],
      isNew: true,
      variants: [
        { label: "55", price: 3200, currency: "EUR" },
        { label: "70", price: 3900, currency: "EUR" }
      ]
    },
    {
      name: "Sac de voyage Keepall Bandouliere",
      description: "Sac de voyage souple en toile Monogram avec bandouliere",
      aliases: ["sac de voyage", "keepall"],
      isNew: false,
      variants: [{ label: "50", price: 2100, currency: "EUR" }]
    },
    {
      name: "Sac costume",
      description: "Housse de transport pour costumes en toile Monogram",
      aliases: ["sac costume", "housse costume"],
      isNew: false,
      variants: [{ label: "Standard", price: 3350, currency: "EUR" }]
    },
    {
      name: "Boite a chapeau Monogram",
      description: "Boite a chapeau rigide en toile Monogram avec ruban interieur",
      aliases: ["boite a chapeau", "boite chapeau"],
      isNew: true,
      variants: [{ label: "Standard", price: 2600, currency: "EUR" }]
    }
  ]
};

async function main() {
  const catalogIdsBySlug = {};

  for (const catalogInput of catalogs) {
    const catalog = await upsertCatalog(catalogInput);
    catalogIdsBySlug[catalogInput.slug] = catalog.id;
    console.log(`Catalogue "${catalog.name}" (id=${catalog.id}) OK`);
  }

  for (const [slug, productList] of Object.entries(products)) {
    const catalogId = catalogIdsBySlug[slug];
    await replaceCatalogProducts(catalogId, productList);
    console.log(`Catalogue "${slug}": ${productList.length} produits ajoutes`);
  }

  console.log("Seed termine.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Erreur lors du seed:", error);
  process.exit(1);
});