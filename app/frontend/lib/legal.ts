export const legalContactEmail =
  process.env.LEGAL_CONTACT_EMAIL?.trim() || "contact@ndxperformancelab.com";

export const legalIdentity = {
  siteName: "974 Darts AI",
  siteUrl: "https://974darts.re",
  updatedAt: "30 septembre 2026",
  publisherName: "Nicolas Eric Dupont",
  publisherStatus: "Entrepreneur individuel (EI)",
  businessName: "NDX Performance Lab",
  siren: "109 232 264",
  siret: "109 232 264 00019",
  register: "Registre national des entreprises (RNE)",
  publisherAddress: "6 chemin des Calumets, 97436 Saint-Leu, France",
  publisherPhone: "07 43 53 86 58",
  publisherPhoneHref: "tel:+33743538658",
  publicationDirector: "Nicolas Eric Dupont",
  host: {
    name: "OVH SAS",
    address: "2 rue Kellermann, 59100 Roubaix, France",
    phone: "1007 (depuis la France)",
    website: "https://www.ovhcloud.com/fr/",
  },
  dataHost: {
    name: "SUPABASE PTE. LTD.",
    address: "65 Chulia Street #38-02/03, OCBC Centre, Singapour 049513",
    website: "https://supabase.com/",
    region: "Région principale du projet : eu-west-3 (Paris, France)",
  },
} as const;
