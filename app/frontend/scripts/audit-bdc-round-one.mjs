import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const detailsUrl = new URL("../lib/bdc-round-one-details.json", import.meta.url);
const endpoint = "https://tk2-228-23746.vs.sakura.ne.jp/n01/tournament/n01_user_t.php?cmd=match_view&sid=";
const shouldWrite = process.argv.includes("--write");

const average = (score, darts) => darts > 0
  ? Math.round((score * 3 / darts) * 100) / 100
  : null;

const emptyPlayer = (name) => ({
  name,
  score: 0,
  darts: 0,
  first9Score: 0,
  first9Darts: 0,
  visits100: 0,
  visits140: 0,
  visits170: 0,
  visits180: 0,
  zeroVisits: 0,
  finishes: [],
  average3: null,
  first9: null,
  bestFinish: null,
});

async function fetchMatch(matchId) {
  const tmid = matchId.replace(/^m1-/, "t_iIQi_5560_");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tmid }),
    signal: AbortSignal.timeout(45_000),
  });
  assert.equal(response.ok, true, `Lecture impossible pour ${matchId}`);
  return response.json();
}

function analyseSide(payload, sideIndex, matchId) {
  const team = payload.statsData[sideIndex];
  const names = team.name.split(" / ").map((name) => name.trim());
  assert.equal(names.length, 2, `Doublette invalide pour ${matchId}`);
  const players = Object.fromEntries(names.map((name) => [name, emptyPlayer(name)]));

  for (const [legIndex, leg] of (payload.legData ?? []).entries()) {
    const visits = leg.playerData?.[sideIndex] ?? [];
    for (let visitIndex = 1; visitIndex < visits.length; visitIndex += 1) {
      const rawVisit = visits[visitIndex];
      const isCheckout = rawVisit.score < 0;
      const darts = isCheckout ? -rawVisit.score : 3;
      const score = isCheckout ? visits[visitIndex - 1].left : rawVisit.score;
      const name = names[(visitIndex - 1) % 2];
      const player = players[name];
      const playerVisitInLeg = Math.floor((visitIndex - 1) / 2) + 1;

      assert.ok(darts >= 1 && darts <= 3, `Nombre de fléchettes invalide dans ${matchId}`);
      assert.ok(score >= 0 && score <= 180, `Score invalide dans ${matchId}`);

      player.score += score;
      player.darts += darts;
      if (score === 0) player.zeroVisits += 1;
      if (score >= 100 && score <= 139) player.visits100 += 1;
      if (score >= 140 && score <= 169) player.visits140 += 1;
      if (score >= 170 && score <= 179) player.visits170 += 1;
      if (score === 180) player.visits180 += 1;
      if (playerVisitInLeg <= 3) {
        player.first9Score += score;
        player.first9Darts += darts;
      }

      if (isCheckout) {
        assert.equal(leg.winner, sideIndex, `Finish attribué au mauvais duo dans ${matchId}`);
        player.finishes.push({ leg: legIndex + 1, value: score, darts, matchId });
      }
    }
  }

  for (const player of Object.values(players)) {
    player.average3 = average(player.score, player.darts);
    player.first9 = average(player.first9Score, player.first9Darts);
    player.bestFinish = player.finishes.length
      ? Math.max(...player.finishes.map((finish) => finish.value))
      : null;
  }

  const playerRows = Object.values(players);
  assert.equal(playerRows.reduce((sum, player) => sum + player.score, 0), team.allScore, `Total score incohérent pour ${team.name} dans ${matchId}`);
  assert.equal(playerRows.reduce((sum, player) => sum + player.darts, 0), team.allDarts, `Total fléchettes incohérent pour ${team.name} dans ${matchId}`);
  return playerRows;
}

function comparable(player) {
  return {
    score: player.score,
    darts: player.darts,
    first9Score: player.first9Score,
    first9Darts: player.first9Darts,
    visits100: player.visits100,
    visits140: player.visits140,
    visits170: player.visits170,
    visits180: player.visits180,
    finishes: player.finishes.map(({ leg, value, darts }) => ({ leg, value, darts })),
    average3: player.average3,
    first9: player.first9,
    bestFinish: player.bestFinish,
  };
}

function aggregatePlayers(matches, existingOrder) {
  const aggregates = new Map(existingOrder.map((player) => [player.name, {
    ...emptyPlayer(player.name),
    matches: 0,
    duoScore: 0,
    contribution: null,
  }]));

  for (const match of matches) {
    for (const side of [match.teamA, match.teamB]) {
      if (!side.players) continue;
      const duoScore = side.players.reduce((sum, player) => sum + player.score, 0);
      for (const player of side.players) {
        const total = aggregates.get(player.name);
        assert.ok(total, `Joueur inconnu : ${player.name}`);
        total.matches += 1;
        total.score += player.score;
        total.darts += player.darts;
        total.first9Score += player.first9Score;
        total.first9Darts += player.first9Darts;
        total.visits100 += player.visits100;
        total.visits140 += player.visits140;
        total.visits170 += player.visits170;
        total.visits180 += player.visits180;
        total.zeroVisits += player.zeroVisits;
        total.finishes.push(...player.finishes);
        total.duoScore += duoScore;
      }
    }
  }

  for (const player of aggregates.values()) {
    player.average3 = average(player.score, player.darts);
    player.first9 = average(player.first9Score, player.first9Darts);
    player.bestFinish = player.finishes.length
      ? Math.max(...player.finishes.map((finish) => finish.value))
      : null;
    player.contribution = player.duoScore > 0
      ? Math.round((player.score / player.duoScore) * 1000) / 10
      : null;
  }

  return [...aggregates.values()].sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
}

const details = JSON.parse(await readFile(detailsUrl, "utf8"));
const payloads = new Map();
for (let index = 0; index < details.matches.length; index += 8) {
  const group = details.matches.slice(index, index + 8);
  const responses = await Promise.all(group.map(async (match) => [match.id, await fetchMatch(match.id)]));
  responses.forEach(([matchId, payload]) => payloads.set(matchId, payload));
}

let verifiedExistingMatches = 0;
const matches = details.matches.map((match) => {
  const payload = payloads.get(match.id);
  const legData = payload?.legData ?? [];
  const statsData = payload?.statsData ?? [];
  const hasRecordedVisits = statsData.some((team) => team.allDarts > 0)
    && legData.some((leg) => leg.playerData?.some((visits) => visits.length > 1));
  if (!hasRecordedVisits || statsData.length !== 2) {
    return {
      ...match,
      dataStatus: "unavailable-individual",
      recordedLegs: 0,
      officialLegs: match.teamA.score + match.teamB.score,
      teamA: { ...match.teamA, players: null, validatedFinishes: undefined },
      teamB: { ...match.teamB, players: null, validatedFinishes: undefined },
    };
  }

  const analysed = new Map(statsData.map((team, sideIndex) => [team.name, analyseSide(payload, sideIndex, match.id)]));
  const teamAPlayers = analysed.get(match.teamA.name);
  const teamBPlayers = analysed.get(match.teamB.name);
  assert.ok(teamAPlayers && teamBPlayers, `Noms de doublettes incohérents dans ${match.id}`);

  if (match.teamA.players && match.teamB.players) {
    for (const current of [...match.teamA.players, ...match.teamB.players]) {
      const audited = [...teamAPlayers, ...teamBPlayers].find((player) => player.name === current.name);
      assert.deepEqual(comparable(audited), comparable(current), `Écart avec les statistiques déjà publiées pour ${current.name} dans ${match.id}`);
    }
    verifiedExistingMatches += 1;
  }

  const winsByName = Object.fromEntries(statsData.map((team) => [team.name, team.winLegs]));
  const setsByName = Object.fromEntries(statsData.map((team) => [team.name, team.winSets]));
  const recordedLegs = statsData.reduce((sum, team) => sum + team.winLegs, 0);
  const officialLegs = match.scoreUnit === "legs"
    ? match.teamA.score + match.teamB.score
    : recordedLegs;
  const rawMatchesOfficial = match.scoreUnit === "sets"
    ? setsByName[match.teamA.name] === match.teamA.score && setsByName[match.teamB.name] === match.teamB.score
    : winsByName[match.teamA.name] === match.teamA.score && winsByName[match.teamB.name] === match.teamB.score;

  return {
    ...match,
    dataStatus: rawMatchesOfficial ? "partial-individual" : "partial-individual-incomplete",
    recordedLegs,
    officialLegs,
    teamA: { ...match.teamA, players: teamAPlayers, validatedFinishes: undefined },
    teamB: { ...match.teamB, players: teamBPlayers, validatedFinishes: undefined },
  };
});

assert.equal(verifiedExistingMatches, 16, "Les 16 feuilles déjà détaillées doivent être revérifiées");
assert.equal(matches.filter((match) => match.dataStatus === "unavailable-individual").length, 1);
assert.equal(matches.filter((match) => match.dataStatus === "partial-individual-incomplete").length, 3);
assert.equal(matches.filter((match) => match.teamA.players && match.teamB.players).length, 31);

const playerStats = aggregatePlayers(matches, details.playerStats);
const output = {
  ...details,
  quality: {
    ...details.quality,
    individualMatches: 31,
    incompleteMatches: 3,
    unavailableMatches: 1,
  },
  matches,
  playerStats,
};

if (shouldWrite) {
  await writeFile(detailsUrl, `${JSON.stringify(output, null, 2)}\n`);
}

const totals = playerStats.reduce((summary, player) => ({
  score: summary.score + player.score,
  darts: summary.darts + player.darts,
  finishes: summary.finishes + player.finishes.length,
  zeroVisits: summary.zeroVisits + player.zeroVisits,
  visits100: summary.visits100 + player.visits100,
  visits140: summary.visits140 + player.visits140,
  visits170: summary.visits170 + player.visits170,
  visits180: summary.visits180 + player.visits180,
}), { score: 0, darts: 0, finishes: 0, zeroVisits: 0, visits100: 0, visits140: 0, visits170: 0, visits180: 0 });

console.log(JSON.stringify({
  file: fileURLToPath(detailsUrl),
  wrote: shouldWrite,
  verifiedExistingMatches,
  analysedMatches: 31,
  incompleteMatches: 3,
  unavailableMatches: 1,
  totals,
}, null, 2));
