
import type { Timestamp } from "firebase/firestore";

type Player = {
    id?: string;
    firstname: string;
    lastname: string;
    middlename: string | null;
    number: string | null;
    [key: string]: unknown;
}

type Team = {
    id?: string;
    wins: number;
    losses: number;
    players: string[];
    teamAbbr: string;
    teamLogo: string;
    teamName: string;
    [key: string]: unknown;
}

type League = {
    id?: string;
    createAt: unknown;
    createdBy: string;
    dateSchedule: string[];
    leagueData: Record<string, unknown>;
    leagueImage: string;
    participatingTeams: string[];
    participatingteams?: string[];
    startDate: string;
    status: "Finished" | "Ongoing";
    timeFrom: string;
    timeTo: string;
    title: string;
    updatedAt: unknown;
    updatedBy: string;
    venue: string;
    [key: string]: unknown;
}

type GameStatLine = {
    attempt: number;
    made: number;
    percentage: string;
};

type GameTeamStats = {
    assists: number;
    blocks: number;
    fouls: number;
    rebounds: number;
    turnovers: number;
    steals: number;
    fieldGoals: GameStatLine;
    freeThrows: GameStatLine;
    points: number;
    threePoints: GameStatLine;
    twoPoints: GameStatLine;
};

type GameRecordPlayerStats = {
    assists: number;
    blocks: number;
    fouls: number;
    freeThrowsAttempted: number;
    playerId?: string | null;
    freeThrowsMade: number;
    id: string;
    rebounds: number;
    steals: number;
    threePointsAttempted: number;
    threePointsMade: number;
    turnovers: number;
    twoPointsAttempted: number;
    twoPointsMade: number;
};

type Game = {
    date: Timestamp | unknown;
    doc: string;
    leagueId: string;
    number: number;
    players: string[];
    playerStats: {
        teamA: GameRecordPlayerStats[];
        teamB: GameRecordPlayerStats[];
    };
    teamA: {
        id: string;
        stats: GameTeamStats;
    };
    teamB: {
        id: string;
        stats: GameTeamStats;
    };
    teams: string[];
    time: Timestamp | unknown;
    [key: string]: unknown;
};

type GamePlayerStats = GameRecordPlayerStats;

type GameCreateInput = {
    leagueId: string;
    number: number;
    date: string;
    time: string;
    playerOfTheGame: string | null;
    teamAId: string;
    teamAPlayers: GamePlayerStats[];
    teamBId: string;
    teamBPlayers: GamePlayerStats[];
};

type PlayingPlayers = {
    teamA: string[],
    teamB: string[]
}

type LiveStatsForm = {
    leagueId: string;
    teamAId: string;
    teamBId: string;
    stats?: GameRecordPlayerStats[];
    playingPlayers: PlayingPlayers; 
    status: boolean | null;
    createdAt?: Timestamp | unknown;
}


type IncrementableStatKey = keyof Omit<GameRecordPlayerStats, "id" | "playerId">;

interface StatAction {
  liveStatId: string;
  statDocId: string;
  key: IncrementableStatKey;
  type: "increment" | "decrement";
  amount: number;
  timestamp: Date;
}

interface StatCommand {
  execute(): void;
  undo(): void;
  meta: StatAction;
}


type GameUpdateInput = GameCreateInput;

export type {
    Game,
    GameCreateInput,
    GamePlayerStats,
    GameRecordPlayerStats,
    GameStatLine,
    GameTeamStats,
    GameUpdateInput,
    LiveStatsForm,
    League,
    Player,
    Team,
    PlayingPlayers,
    StatAction,
    StatCommand,
    IncrementableStatKey
}