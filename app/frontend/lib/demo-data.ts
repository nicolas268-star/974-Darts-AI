export const demoData = {
  "players": [
    {
      "rank": 1,
      "name": "Pierre",
      "team": "Fournaise",
      "average": 52.47,
      "winRate": 0.68,
      "elo": 1846,
      "trend": "+18"
    },
    {
      "rank": 2,
      "name": "Alex",
      "team": "Fournaise",
      "average": 48.94,
      "winRate": 0.53,
      "elo": 1788,
      "trend": "+11"
    },
    {
      "rank": 3,
      "name": "Fran",
      "team": "Neige",
      "average": 48.54,
      "winRate": 0.25,
      "elo": 1712,
      "trend": "-4"
    },
    {
      "rank": 4,
      "name": "Nico",
      "team": "Fournaise",
      "average": 43.14,
      "winRate": 0.46,
      "elo": 1698,
      "trend": "+9"
    }
  ],
  "teams": [
    {
      "rank": 1,
      "name": "Fournaise",
      "played": 7,
      "wins": 4,
      "rate": 0.57
    },
    {
      "rank": 2,
      "name": "3BC",
      "played": 7,
      "wins": 4,
      "rate": 0.57
    },
    {
      "rank": 3,
      "name": "Neige",
      "played": 7,
      "wins": 3,
      "rate": 0.43
    }
  ],
  "daily": [
    {
      "day": "J1",
      "average": 39.8
    },
    {
      "day": "J2",
      "average": 41.2
    },
    {
      "day": "J3",
      "average": 43.9
    },
    {
      "day": "J4",
      "average": 42.7
    },
    {
      "day": "J5",
      "average": 45.1
    },
    {
      "day": "J6",
      "average": 46.3
    },
    {
      "day": "J7",
      "average": 44.8
    }
  ]
} as const;
