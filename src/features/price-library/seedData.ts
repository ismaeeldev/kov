/**
 * Plumbing-heating (plomberie_chauffage) starter price-library seed —
 * docs/03_MasterPrompts.md §7.2 item 2. Applied automatically the moment a
 * new business completes onboarding with trade='plomberie_chauffage'
 * (see src/features/onboarding/OnboardingPage.tsx's handleBusinessInfoSubmit).
 *
 * Realistic purchase/sale prices for the persona (Martin Da Silva, module 6.6
 * reference data) — purchase_price is the artisan's trade cost, sale_price is
 * what's quoted to the client, is_supply distinguishes materials from labor.
 */
export interface PriceItemSeed {
  label: string
  unit: string
  purchase_price: number
  sale_price: number
  default_vat_rate: 0 | 5.5 | 10 | 20
  category: string
  is_supply: boolean
}

export const PLOMBERIE_CHAUFFAGE_SEED: PriceItemSeed[] = [
  // Main d'oeuvre
  {
    label: "Main d'oeuvre plombier (heure)",
    unit: 'heure',
    purchase_price: 0,
    sale_price: 55,
    default_vat_rate: 20,
    category: "Main d'oeuvre",
    is_supply: false,
  },
  {
    label: "Main d'oeuvre chauffagiste (heure)",
    unit: 'heure',
    purchase_price: 0,
    sale_price: 60,
    default_vat_rate: 20,
    category: "Main d'oeuvre",
    is_supply: false,
  },
  {
    label: 'Déplacement / forfait intervention',
    unit: 'forfait',
    purchase_price: 0,
    sale_price: 45,
    default_vat_rate: 20,
    category: "Main d'oeuvre",
    is_supply: false,
  },

  // Sanitaire
  {
    label: 'Receveur de douche extra-plat 90x90',
    unit: 'unité',
    purchase_price: 145,
    sale_price: 260,
    default_vat_rate: 10,
    category: 'Sanitaire',
    is_supply: true,
  },
  {
    label: 'WC suspendu + bâti-support',
    unit: 'unité',
    purchase_price: 180,
    sale_price: 340,
    default_vat_rate: 10,
    category: 'Sanitaire',
    is_supply: true,
  },
  {
    label: 'Lavabo avec meuble sous-vasque',
    unit: 'unité',
    purchase_price: 210,
    sale_price: 390,
    default_vat_rate: 10,
    category: 'Sanitaire',
    is_supply: true,
  },
  {
    label: 'Mitigeur thermostatique douche',
    unit: 'unité',
    purchase_price: 85,
    sale_price: 165,
    default_vat_rate: 10,
    category: 'Sanitaire',
    is_supply: true,
  },
  {
    label: 'Colonne de douche',
    unit: 'unité',
    purchase_price: 120,
    sale_price: 220,
    default_vat_rate: 10,
    category: 'Sanitaire',
    is_supply: true,
  },
  {
    label: 'Paroi de douche vitrée',
    unit: 'unité',
    purchase_price: 250,
    sale_price: 450,
    default_vat_rate: 10,
    category: 'Sanitaire',
    is_supply: true,
  },

  // Chauffage
  {
    label: 'Chauffe-eau électrique 200L',
    unit: 'unité',
    purchase_price: 320,
    sale_price: 580,
    default_vat_rate: 10,
    category: 'Chauffage',
    is_supply: true,
  },
  {
    label: 'Chaudière gaz à condensation',
    unit: 'unité',
    purchase_price: 1800,
    sale_price: 3200,
    default_vat_rate: 10,
    category: 'Chauffage',
    is_supply: true,
  },
  {
    label: 'Radiateur eau chaude acier (standard)',
    unit: 'unité',
    purchase_price: 95,
    sale_price: 190,
    default_vat_rate: 10,
    category: 'Chauffage',
    is_supply: true,
  },
  {
    label: 'Radiateur sèche-serviettes électrique',
    unit: 'unité',
    purchase_price: 140,
    sale_price: 260,
    default_vat_rate: 10,
    category: 'Chauffage',
    is_supply: true,
  },
  {
    label: 'Thermostat connecté',
    unit: 'unité',
    purchase_price: 110,
    sale_price: 210,
    default_vat_rate: 10,
    category: 'Chauffage',
    is_supply: true,
  },
  {
    label: 'Purge/désembouage circuit chauffage',
    unit: 'forfait',
    purchase_price: 40,
    sale_price: 150,
    default_vat_rate: 20,
    category: 'Chauffage',
    is_supply: false,
  },

  // Tuyauterie / réseau
  {
    label: 'Tube PER 16mm (mètre linéaire)',
    unit: 'mètre',
    purchase_price: 1.8,
    sale_price: 4.5,
    default_vat_rate: 10,
    category: 'Tuyauterie',
    is_supply: true,
  },
  {
    label: 'Tube cuivre 14mm (mètre linéaire)',
    unit: 'mètre',
    purchase_price: 3.2,
    sale_price: 7.5,
    default_vat_rate: 10,
    category: 'Tuyauterie',
    is_supply: true,
  },
  {
    label: 'Robinet arrêt / vanne',
    unit: 'unité',
    purchase_price: 12,
    sale_price: 28,
    default_vat_rate: 10,
    category: 'Tuyauterie',
    is_supply: true,
  },
  {
    label: 'Recherche de fuite',
    unit: 'forfait',
    purchase_price: 0,
    sale_price: 120,
    default_vat_rate: 20,
    category: 'Tuyauterie',
    is_supply: false,
  },
  {
    label: 'Débouchage canalisation',
    unit: 'forfait',
    purchase_price: 0,
    sale_price: 95,
    default_vat_rate: 20,
    category: 'Tuyauterie',
    is_supply: false,
  },
]
