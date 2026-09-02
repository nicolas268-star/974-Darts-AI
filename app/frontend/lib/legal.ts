export const legalContactEmail =
  process.env.LEGAL_CONTACT_EMAIL?.trim() || "contact@974darts.re";

export const legalIdentity = {
  siteName: "974 Darts AI",
  siteUrl: "https://974darts.re",
  publisherName: "Nicolas Dupont",
  publisherStatus: "Éditeur non professionnel, à titre personnel",
  publicationDirector: "Nicolas Dupont",
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
