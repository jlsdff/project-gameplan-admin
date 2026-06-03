
import type { Timestamp } from "firebase/firestore";

type Player = {
    firstname: string;
    lastname: string;
    middlename: string | null;
    number: string | null;
    [key: string]: unknown;
}

type Team = {
    wins: number;
    losses: number;
    players: string[];
    teamAbbr: string;
    teamLogo: string;
    teamName: string;
    [key: string]: unknown;
}

type League = {
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
    teamAId: string;
    teamAPlayers: GamePlayerStats[];
    teamBId: string;
    teamBPlayers: GamePlayerStats[];
};

type GameUpdateInput = GameCreateInput;

export type {
    Game,
    GameCreateInput,
    GamePlayerStats,
    GameRecordPlayerStats,
    GameStatLine,
    GameTeamStats,
    GameUpdateInput,
    League,
    Player,
    Team,
}