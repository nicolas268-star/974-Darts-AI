export type CricketCoordinate = readonly [number, number];

export type CricketPlayer = {
  id: string;
  name: string;
  winner: boolean;
  legs: number;
  sets: number;
  throws: number;
  points: number;
  marks: number;
  marksPerRound: number;
  scorePerRound: number;
  targets: Record<"20" | "19" | "18" | "17" | "16" | "15" | "Bull", readonly [number, number]>;
  coordinatesByLeg: readonly CricketCoordinate[][];
};

export type CricketMatch = {
  gameId: string;
  source: string;
  board: string;
  date: string;
  durationSeconds: number;
  format: string;
  status: "Terminé";
  players: readonly CricketPlayer[];
};

export const cricketTestMatches: readonly CricketMatch[] = [{
  gameId: "YK9WJWLLDSZN",
  source: "Scolia",
  board: "Winter Camp",
  date: "2026-08-09T11:43:27.476Z",
  durationSeconds: 1026,
  format: "Cricket · Premier à 2 legs · Standard",
  status: "Terminé",
  players: [
    {
      id: "ju", name: "Ju", winner: true, legs: 2, sets: 1, throws: 85, points: 220, marks: 53,
      marksPerRound: 1.87, scorePerRound: 7.76,
      targets: { "20": [17,13], "19": [6,9], "18": [6,4], "17": [6,8], "16": [6,8], "15": [6,4], Bull: [6,5] },
      coordinatesByLeg: [
        [[-5,115],[-11,112],[33,82],[-4,60],[5,102],[50,36],[-21,95],[-8,74],[-3,116],[-11,107],[-26,79],[58,78],[-10,100],[-17,-86],[-26,-128],[27,-116],[45,-128],[12,-141],[46,-124],[-51,-76],[-26,-120],[-18,137],[-10,130],[13,3],[-68,-50],[-127,-92],[-64,-49],[-20,60],[95,-57],[42,-50],[102,-118],[126,-103],[8,-24],[-44,136],[-34,-31],[2,0]],
        [[-13,58],[-10,89],[-21,96],[3,107],[10,142],[-22,-81],[-40,-126],[-48,-100],[77,92],[95,27],[105,62],[73,94],[29,48],[46,-98],[5,-144],[46,-68],[69,-95],[47,-69],[34,-119],[38,-116],[0,-100],[-107,-63],[-73,-88],[-100,-68],[-85,-29],[-118,-126],[-88,-93],[-95,-35],[-115,-78],[67,-58],[76,-64],[-16,-20],[-23,41],[6,-20],[0,-55],[1,-56],[27,0],[-32,27],[-9,-49],[-13,-35],[-19,-14],[-5,-8],[-21,0],[0,-26],[-6,-25],[21,13],[-4,-9],[-20,17],[-1,10]],
      ],
    },
    {
      id: "nicolas", name: "Nicolas", winner: false, legs: 0, sets: 0, throws: 84, points: 204, marks: 48,
      marksPerRound: 1.71, scorePerRound: 7.29,
      targets: { "20": [4,4], "19": [6,5], "18": [11,9], "17": [8,6], "16": [11,7], "15": [6,5], Bull: [2,2] },
      coordinatesByLeg: [
        [[13,19],[64,118],[109,31],[55,99],[67,139],[78,147],[51,86],[-42,110],[35,116],[103,88],[63,142],[-25,143],[8,-41],[24,-101],[43,-72],[13,-101],[14,-75],[-50,-77],[56,-99],[59,-111],[20,-154],[-72,-59],[-81,-62],[-67,-56],[-64,-77],[-79,-65],[-91,-44],[80,-45],[56,-93],[116,-45],[57,-47],[99,-20],[105,-57],[-34,-93],[-19,143],[6,173]],
        [[15,36],[-6,163],[0,127],[-21,-81],[-18,-86],[-33,-83],[65,56],[71,103],[91,71],[59,91],[62,130],[59,95],[8,-130],[19,-48],[11,-50],[0,-98],[8,-82],[59,-113],[26,-95],[-94,-75],[-100,-95],[-60,-106],[-65,-90],[-117,-43],[-90,-79],[-92,-124],[-127,-115],[66,-6],[74,-65],[75,-81],[42,-57],[6,6],[0,24],[-37,51],[28,-19],[-9,-7],[-11,45],[1,-33],[23,-35],[-44,46],[-25,95],[-25,-45],[-15,-53],[20,0],[26,0],[11,14],[-21,6],[48,27]],
      ],
    },
  ],
}];

export const cricketTestMatch = cricketTestMatches[0];

export function findCricketMatch(gameId: string) {
  return cricketTestMatches.find((match) => match.gameId === gameId);
}
