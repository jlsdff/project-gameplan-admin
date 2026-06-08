import {
  collection,
  DocumentData,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  QueryDocumentSnapshot,
  startAfter,
  Timestamp,
  writeBatch,
} from "firebase/firestore";

import { db } from "@/lib/firebase/firebase";
import type {
  Game,
  GameCreateInput,
  GamePlayerStats,
  GameRecordPlayerStats,
  GameTeamStats,
  GameUpdateInput,
} from "@/types/models";
import { getLeague } from "@/lib/leagues/crud";

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export type GamesPage = {
  games: Array<Game & { id: string }>;
  lastVisible: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
};

  export async function getGamesPage(
    pageSize = 20,
    lastVisible: QueryDocumentSnapshot<DocumentData> | null = null,
  ): Promise<GamesPage> {
    const gamesCollection = collection(db, "games");
    const gamesQuery = lastVisible
      ? query(gamesCollection, orderBy("date", "desc"), startAfter(lastVisible), limit(pageSize))
      : query(gamesCollection, orderBy("date", "desc"), limit(pageSize));

    const snapshot = await getDocs(gamesQuery);
    const games = snapshot.docs.map((gameDoc) => ({
      id: gameDoc.id,
      ...(gameDoc.data() as Game),
    }));

    return {
      games,
      lastVisible: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null,
      hasMore: snapshot.docs.length === pageSize,
    };
  }

function toTimestamp(value: string, timeValue?: string) {
  const normalizedValue = timeValue ? `${value}T${timeValue}:00` : value;
  const parsed = new Date(normalizedValue);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date value.");
  }

  return Timestamp.fromDate(parsed);
}

function getUniquePlayerIds(teamAPlayers: GamePlayerStats[], teamBPlayers: GamePlayerStats[]) {
  return Array.from(
    new Set([...teamAPlayers, ...teamBPlayers].map((player) => player.id)),
  );
}

function getTeamStats(teamPlayers: GamePlayerStats[]): GameTeamStats {
  const totals = teamPlayers.reduce(
    (accumulator, player) => {
      accumulator.assists += player.assists;
      accumulator.blocks += player.blocks;
      accumulator.fouls += player.fouls;
      accumulator.rebounds += player.rebounds;
      accumulator.steals += player.steals;
      accumulator.turnovers += player.turnovers;
      accumulator.points += player.threePointsMade * 3 + player.twoPointsMade * 2 + player.freeThrowsMade;
      accumulator.fieldGoalsAttempt += player.twoPointsAttempted + player.threePointsAttempted;
      accumulator.fieldGoalsMade += player.twoPointsMade + player.threePointsMade;
      accumulator.freeThrowsAttempt += player.freeThrowsAttempted;
      accumulator.freeThrowsMade += player.freeThrowsMade;
      accumulator.threePointsAttempt += player.threePointsAttempted;
      accumulator.threePointsMade += player.threePointsMade;
      accumulator.twoPointsAttempt += player.twoPointsAttempted;
      accumulator.twoPointsMade += player.twoPointsMade;
      return accumulator;
    },
    {
      assists: 0,
      blocks: 0,
      fouls: 0,
      rebounds: 0,
      steals: 0,
      turnovers: 0,
      points: 0,
      fieldGoalsAttempt: 0,
      fieldGoalsMade: 0,
      freeThrowsAttempt: 0,
      freeThrowsMade: 0,
      threePointsAttempt: 0,
      threePointsMade: 0,
      twoPointsAttempt: 0,
      twoPointsMade: 0,
    },
  );

  const makePercentage = (made: number, attempt: number) => {
    if (!attempt) {
      return "0%";
    }

    return `${((made / attempt) * 100).toFixed(1)}%`;
  };

  return {
    assists: totals.assists,
    blocks: totals.blocks,
    fouls: totals.fouls,
    rebounds: totals.rebounds,
    steals: totals.steals,
    turnovers: totals.turnovers,
    points: totals.points,
    fieldGoals: {
      attempt: totals.fieldGoalsAttempt,
      made: totals.fieldGoalsMade,
      percentage: makePercentage(totals.fieldGoalsMade, totals.fieldGoalsAttempt),
    },
    freeThrows: {
      attempt: totals.freeThrowsAttempt,
      made: totals.freeThrowsMade,
      percentage: makePercentage(totals.freeThrowsMade, totals.freeThrowsAttempt),
    },
    threePoints: {
      attempt: totals.threePointsAttempt,
      made: totals.threePointsMade,
      percentage: makePercentage(totals.threePointsMade, totals.threePointsAttempt),
    },
    twoPoints: {
      attempt: totals.twoPointsAttempt,
      made: totals.twoPointsMade,
      percentage: makePercentage(totals.twoPointsMade, totals.twoPointsAttempt),
    },
  };
}

function createPlayerRecord(player: GamePlayerStats): GameRecordPlayerStats {
  return {
    assists: player.assists,
    blocks: player.blocks,
    fouls: player.fouls,
    freeThrowsAttempted: player.freeThrowsAttempted,
    freeThrowsMade: player.freeThrowsMade,
    id: player.id,
    rebounds: player.rebounds,
    steals: player.steals,
    threePointsAttempted: player.threePointsAttempted,
    threePointsMade: player.threePointsMade,
    turnovers: player.turnovers,
    twoPointsAttempted: player.twoPointsAttempted,
    twoPointsMade: player.twoPointsMade,
  };
}

function createGameRecordDoc(
  teamId: string,
  teamStats: GameTeamStats,
  playerRecords: GameRecordPlayerStats[],
) {
  return {
    id: teamId,
    playerRecords,
    ...teamStats,
  };
}

async function writeGameCollections(
  gameId: string,
  input: GameCreateInput,
  gameDoc: Game,
  previousGame?: Game & { id: string },
) {
  const batch = writeBatch(db);

  if (previousGame) {
    batch.delete(doc(db, "games", previousGame.id));
  }

  batch.set(doc(db, "games", gameId), gameDoc);

  const teamSnapshots = [
    {
      teamId: input.teamAId,
      teamStats: gameDoc.teamA.stats,
      players: input.teamAPlayers,
    },
    {
      teamId: input.teamBId,
      teamStats: gameDoc.teamB.stats,
      players: input.teamBPlayers,
    },
  ];

  teamSnapshots.forEach(({ teamId, teamStats, players }) => {
    const teamGameRecord = createGameRecordDoc(
      teamId,
      teamStats,
      players.map(createPlayerRecord),
    );

    batch.set(doc(db, "teams", teamId, "gameRecords", gameId), teamGameRecord);
  });

  input.teamAPlayers.forEach((player) => {
    batch.set(doc(db, "players", player.id, "gameRecords", gameId), createPlayerRecord(player));
  });

  input.teamBPlayers.forEach((player) => {
    batch.set(doc(db, "players", player.id, "gameRecords", gameId), createPlayerRecord(player));
  });

  if (previousGame) {
    previousGame.teams.forEach((teamId) => {
      if (teamId !== input.teamAId && teamId !== input.teamBId) {
        batch.delete(doc(db, "teams", teamId, "gameRecords", previousGame.id));
      }
    });

    previousGame.players.forEach((playerId) => {
      if (!getUniquePlayerIds(input.teamAPlayers, input.teamBPlayers).includes(playerId)) {
        batch.delete(doc(db, "players", playerId, "gameRecords", previousGame.id));
      }
    });
  }

  await batch.commit();
}

export async function getGames() {
  const snapshot = await getDocs(query(collection(db, "games"), orderBy("date", "desc")));

  return snapshot.docs.map((gameDoc) => ({
    id: gameDoc.id,
    ...(gameDoc.data() as Game),
  }));
}

export async function getGame(id: string) {
  const snapshot = await getDoc(doc(db, "games", id));

  if (!snapshot.exists()) {
    throw new Error("No such game!");
  }

  return {
    id: snapshot.id,
    ...(snapshot.data() as Game),
  };
}

export async function createGame(input: GameCreateInput) {
  const league = await getLeague(input.leagueId);
  const leagueName = slugify(league.title || input.leagueId);
  const gameId = `${leagueName}-${input.number}`;
  const existingSnapshot = await getDoc(doc(db, "games", gameId));

  if (existingSnapshot.exists()) {
    throw new Error("Game number already taken.");
  }

  const gameDoc: Game = {
    date: toTimestamp(input.date),
    doc: gameId,
    leagueId: input.leagueId,
    number: input.number,
    players: getUniquePlayerIds(input.teamAPlayers, input.teamBPlayers),
    playerStats: {
      teamA: input.teamAPlayers.map(createPlayerRecord),
      teamB: input.teamBPlayers.map(createPlayerRecord),
    },
    teamA: {
      id: input.teamAId,
      stats: getTeamStats(input.teamAPlayers),
    },
    teamB: {
      id: input.teamBId,
      stats: getTeamStats(input.teamBPlayers),
    },
    teams: [input.teamAId, input.teamBId],
    time: toTimestamp(input.date, input.time),
  };

  await writeGameCollections(gameId, input, gameDoc);
  return gameId;
}

export async function updateGame(id: string, input: GameUpdateInput) {
  const previousGame = await getGame(id);
  const league = await getLeague(input.leagueId);
  const leagueName = slugify(league.title || input.leagueId);
  const nextGameId = `${leagueName}-${input.number}`;
  const existingSnapshot = await getDoc(doc(db, "games", nextGameId));

  if (nextGameId !== id && existingSnapshot.exists()) {
    throw new Error("Game number already taken.");
  }

  const gameDoc: Game = {
    date: toTimestamp(input.date),
    doc: nextGameId,
    leagueId: input.leagueId,
    number: input.number,
    players: getUniquePlayerIds(input.teamAPlayers, input.teamBPlayers),
    playerStats: {
      teamA: input.teamAPlayers.map(createPlayerRecord),
      teamB: input.teamBPlayers.map(createPlayerRecord),
    },
    teamA: {
      id: input.teamAId,
      stats: getTeamStats(input.teamAPlayers),
    },
    teamB: {
      id: input.teamBId,
      stats: getTeamStats(input.teamBPlayers),
    },
    teams: [input.teamAId, input.teamBId],
    time: toTimestamp(input.date, input.time),
  };

  await writeGameCollections(nextGameId, input, gameDoc, previousGame);

  if (nextGameId !== id) {
    const batch = writeBatch(db);
    batch.delete(doc(db, "games", id));

    previousGame.teams.forEach((teamId) => {
      batch.delete(doc(db, "teams", teamId, "gameRecords", id));
    });

    previousGame.players.forEach((playerId) => {
      batch.delete(doc(db, "players", playerId, "gameRecords", id));
    });

    await batch.commit();
  }

  return nextGameId;
}

export async function deleteGame(id: string) {
  const game = await getGame(id);
  const batch = writeBatch(db);

  batch.delete(doc(db, "games", id));

  game.teams.forEach((teamId) => {
    batch.delete(doc(db, "teams", teamId, "gameRecords", id));
  });

  game.players.forEach((playerId) => {
    batch.delete(doc(db, "players", playerId, "gameRecords", id));
  });

  await batch.commit();
}
