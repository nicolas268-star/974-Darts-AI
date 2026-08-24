import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

const requiredPages = [
  "app/teams/[team_id]/page.tsx",
  "app/matches/[result_id]/page.tsx",
  "app/players/[player_id]/page.tsx",
  "app/players/compare/[left_player_id]/[right_player_id]/page.tsx",
  "app/duos/[player_1_id]/[player_2_id]/page.tsx",
  "app/tournaments/[code]/page.tsx",
  "app/championships/[season]/page.tsx",
  "app/admin/control/page.tsx",
  "app/stats/page.tsx",
  "app/play/page.tsx",
  "app/play/501/page.tsx",
  "app/play/cricket/page.tsx",
  "app/play/tictactoe/page.tsx",
  "app/play/bob27/page.tsx",
  "app/play/clock/page.tsx",
];

const missing = [];
for (const page of requiredPages) {
  try {
    await access(page, constants.R_OK);
  } catch {
    missing.push(page);
  }
}

const layout = await readFile("app/layout.tsx", "utf8");
const playerPage = await readFile("app/players/[player_id]/page.tsx", "utf8");
const adminDashboard = await readFile("components/admin/AdminDashboard.tsx", "utf8");

const errors = [];
if (missing.length) errors.push(`Routes absentes : ${missing.join(", ")}`);
if (!layout.includes('metadataBase: new URL("https://974darts.re")')) {
  errors.push("Origine canonique SEO absente.");
}
if (!layout.includes('<html lang="fr-RE">')) {
  errors.push("Langue fr-RE absente.");
}
if (/contrat\s+(Coach|Player DNA)/i.test(playerPage)) {
  errors.push("Un numéro de contrat reste visible sur la page joueur.");
}
if (/Version Cockpit/i.test(adminDashboard)) {
  errors.push("Une version technique reste visible dans le cockpit.");
}

const home = await readFile("app/page.tsx", "utf8");
const sidebar = await readFile("components/Sidebar.tsx", "utf8");
const playHub = await readFile("app/play/page.tsx", "utf8");
for (const label of ["Stats & Données", "Jeux", "Admin"]) {
  if (!layout.includes(label) || !sidebar.includes(label)) {
    errors.push(`Domaine de navigation absent : ${label}`);
  }
}
for (const href of ["/play/501", "/play/cricket", "/play/tictactoe", "/play/bob27", "/play/clock"]) {
  if (!playHub.includes(href)) errors.push(`Jeu absent du hub : ${href}`);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Contrôle frontend conforme : ${requiredPages.length} routes, SEO et libellés validés.`);
