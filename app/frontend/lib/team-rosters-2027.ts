export type TeamRoster2027 = {
  id: string;
  name: string;
  club: string;
  players: { officialName: string; nakkaName: string; license: string }[];
};

export const TEAM_ROSTERS_2027: TeamRoster2027[] = [
  { id: "pdc-neige", name: "Papangue Darts Club - Neige", club: "Papangue Darts Club", players: [
    { officialName: "Corentin BROUAZIN", nakkaName: "Corentin", license: "97402002" },
    { officialName: "Pierre BERLET", nakkaName: "Pierre", license: "97402003" },
    { officialName: "Julien FAUCHER", nakkaName: "Julien", license: "97402007" },
    { officialName: "Alexandre SANZ VILLAR", nakkaName: "Alex", license: "97402005" },
    { officialName: "Benoit CHOUPEAULT", nakkaName: "Ben", license: "97402009" },
  ] },
  { id: "pdc-fournaise", name: "Papangue Darts Club - Fournaise", club: "Papangue Darts Club", players: [
    { officialName: "Fabien GUINOBERT", nakkaName: "Fabien", license: "97402001" },
    { officialName: "Christophe FERNANDEZ", nakkaName: "Stoo", license: "97402004" },
    { officialName: "Etienne BEAUR", nakkaName: "Etienne", license: "97402006" },
    { officialName: "Adrien LICHTENHAHN", nakkaName: "Adrien", license: "97402008" },
    { officialName: "Nicolas DUPONT", nakkaName: "Nico", license: "97402010" },
  ] },
  { id: "tdc-zarboutan", name: "Tampon Darts Club - Zarboutan", club: "Tampon Darts Club", players: [
    { officialName: "Guillaume HOARAU", nakkaName: "Guillaume", license: "97404013" },
    { officialName: "Mario DEVILLE", nakkaName: "Mario", license: "97404014" },
    { officialName: "Laurent JOUGLET", nakkaName: "Laurent", license: "97403005" },
    { officialName: "Benjamin DUBOURDIEU", nakkaName: "Benjamin", license: "97403007" },
    { officialName: "Beverley ECALLE", nakkaName: "Beverley", license: "97403002" },
    { officialName: "Elodie CHARNEAU", nakkaName: "Elodie", license: "97403004" },
    { officialName: "Dominique FONTAINE", nakkaName: "Dominique", license: "97403003" },
  ] },
  { id: "tdc-zarlor", name: "Tampon Darts Club - Zarlor", club: "Tampon Darts Club", players: [
    { officialName: "Stéphane ABROUSSE", nakkaName: "Stéphane A", license: "97403012" },
    { officialName: "Kévin BARRET", nakkaName: "Kevin", license: "97403008" },
    { officialName: "Vincent GUILLAUMOND", nakkaName: "Vincent G", license: "97403009" },
    { officialName: "Gary DEVILLE", nakkaName: "Gary", license: "97404015" },
    { officialName: "Coralie PAYET", nakkaName: "Coralie", license: "97403010" },
    { officialName: "Jean François RIVIERE", nakkaName: "Fran", license: "97403011" },
    { officialName: "Maxime COUILLON", nakkaName: "Maxime", license: "97403006" },
  ] },
  { id: "kaz-a", name: "Kaz A Darts - A", club: "Kaz A Darts 974", players: [
    { officialName: "Yoann MARQUES", nakkaName: "Yoann", license: "97401015" },
    { officialName: "Nicolas DURUISSEAU", nakkaName: "Dudul", license: "97401016" },
    { officialName: "Hervé MAGARIAN", nakkaName: "Hervé", license: "97401011" },
    { officialName: "Antoine JACOB", nakkaName: "Antoine", license: "9701010" },
    { officialName: "Julien LARRIEU", nakkaName: "Ju", license: "97401004" },
    { officialName: "Emmanuel GRASSET", nakkaName: "Manu", license: "97401018" },
  ] },
  { id: "kaz-b", name: "Kaz A Darts - B", club: "Kaz A Darts 974", players: [
    { officialName: "Dominique CANTY", nakkaName: "Domi", license: "97401014" },
    { officialName: "Yvan GEFFROY", nakkaName: "Yvan", license: "97401009" },
    { officialName: "William BIGNON", nakkaName: "Willou", license: "97401005" },
    { officialName: "Gregory VERIN", nakkaName: "Greg", license: "97401001" },
    { officialName: "Mickaël SIBERIL", nakkaName: "Micka", license: "97401013" },
    { officialName: "Frédéric CABANES", nakkaName: "Cabanes", license: "97401006" },
    { officialName: "Ambroise OLIVIER", nakkaName: "Ambroise", license: "97401012" },
    { officialName: "Hugo MAGARIAN", nakkaName: "Hugo", license: "97401017" },
  ] },
  { id: "3bdc-ambre", name: "3B Darts Club - A(mbré)", club: "3B Darts Club", players: [
    { officialName: "Esteban THOMAS", nakkaName: "Esteban", license: "97404011" },
    { officialName: "Jacky VERDIER", nakkaName: "Jacky", license: "97404012" },
    { officialName: "Laurent PARET", nakkaName: "Laurent P", license: "97404005" },
    { officialName: "Marco VOLTOLINI", nakkaName: "Marco", license: "97404013" },
    { officialName: "Stephan PERRIAU", nakkaName: "Stephan", license: "97404006" },
    { officialName: "Caroline PARET", nakkaName: "Caroline", license: "97404004" },
  ] },
  { id: "3bdc-blonde", name: "3B Darts Club - B(londe)", club: "3B Darts Club", players: [
    { officialName: "David DESCHRYVER", nakkaName: "David", license: "97404003" },
    { officialName: "Martin ROCHE", nakkaName: "Martin", license: "97404007" },
    { officialName: "Uldrich TECHER", nakkaName: "Uldrich", license: "97404010" },
    { officialName: "Harold TECHER", nakkaName: "Harold", license: "97404009" },
    { officialName: "Patrick ROUSSETTE", nakkaName: "Patrick", license: "97404008" },
    { officialName: "Vincent AUBERT", nakkaName: "Vincent", license: "97404001" },
    { officialName: "Benoit BRUNET", nakkaName: "Benoit", license: "97404002" },
  ] },
];

export const TEAM_ROSTERS_2027_PLAYER_COUNT = TEAM_ROSTERS_2027.reduce(
  (total, team) => total + team.players.length,
  0,
);
