"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Timestamp } from "firebase/firestore";
import { parseName } from "humanparser";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { WholePageLoading } from "@/components/ui/wholepage-loading";
import { createGame, deleteGame, getGame, updateGame } from "@/lib/games/crud";
import { getLeagues } from "@/lib/leagues/crud";
import { getAllPlayers } from "@/lib/players/crud";
import { getTeamsByIds } from "@/lib/teams/crud";
import type { GamePlayerStats, GameTeamStats } from "@/types/models";

const IMPORT_TEMPLATE_HEADERS = [
  "#",
  "ID",
  "NAME",
  "2PM",
  "2PA",
  "3PM",
  "3PA",
  "FTM",
  "FTA",
  "REB",
  "AST",
  "STL",
  "BLK",
  "FLS",
  "TO",
  "PTS",
  "TEAM",
] as const;

const STAT_KEYS = [
  "assists",
  "blocks",
  "fouls",
  "freeThrowsAttempted",
  "freeThrowsMade",
  "rebounds",
  "steals",
  "threePointsAttempted",
  "threePointsMade",
  "turnovers",
  "twoPointsAttempted",
  "twoPointsMade",
] as const;

type StatKey = (typeof STAT_KEYS)[number];

type PlayerOption = {
  id: string;
  firstname: string;
  lastname: string;
  middlename: string | null;
  number: string | null;
};

type TeamOption = {
  id: string;
  teamName: string;
  teamAbbr: string;
  players: string[];
};

type LeagueOption = {
  id: string;
  title: string;
  participatingTeams: string[];
};

type PlayerFormValue = {
  id: string;
  included: boolean;
} & Record<StatKey, string>;

type ImportedGameRow = {
  rowIndex: number;
  teamId: string | null;
  teamLabel: string;
  jerseyNumber: string;
  rawPlayerId: string;
  lastname: string;
  firstname: string;
  points: string;
  stats: Record<StatKey, string>;
};

type PlayerMatchMode = "exact" | "ambiguous" | "fuzzy";

type ImportedGameRowWithMatch = ImportedGameRow & {
  resolvedPlayerId: string | null;
  candidates: PlayerOption[];
  selectedPlayerId: string | null;
  matchMode: PlayerMatchMode;
};

function requiresPlayerMatchReview(row: ImportedGameRowWithMatch) {
  return row.matchMode !== "exact" || !row.resolvedPlayerId;
}

type GameFormValues = {
  leagueId: string;
  number: string;
  date: string;
  time: string;
  teamAId: string;
  teamBId: string;
  teamAPlayers: PlayerFormValue[];
  teamBPlayers: PlayerFormValue[];
};

type RosterFieldName = "teamAPlayers" | "teamBPlayers";

const playerStatSchema = z.object({
  id: z.string().min(1),
  included: z.boolean(),
  assists: z.string(),
  blocks: z.string(),
  fouls: z.string(),
  freeThrowsAttempted: z.string(),
  freeThrowsMade: z.string(),
  rebounds: z.string(),
  steals: z.string(),
  threePointsAttempted: z.string(),
  threePointsMade: z.string(),
  turnovers: z.string(),
  twoPointsAttempted: z.string(),
  twoPointsMade: z.string(),
});

const gameFormSchema = z
  .object({
    leagueId: z.string().trim().min(1, "League is required."),
    number: z.string().trim().regex(/^\d+$/, "Game number is required."),
    date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format."),
    time: z.string().trim().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM in 24-hour time."),
    teamAId: z.string().trim().min(1, "Team A is required."),
    teamBId: z.string().trim().min(1, "Team B is required."),
    teamAPlayers: z.array(playerStatSchema),
    teamBPlayers: z.array(playerStatSchema),
  })
  .refine((values) => values.teamAId !== values.teamBId, {
    path: ["teamBId"],
    message: "Team B must be different from Team A.",
  });

type GameFormSchema = z.infer<typeof gameFormSchema>;

const EMPTY_FORM_VALUES: GameFormValues = {
  leagueId: "",
  number: "",
  date: "",
  time: "",
  teamAId: "",
  teamBId: "",
  teamAPlayers: [],
  teamBPlayers: [],
};

function getFriendlyErrorMessage(error: unknown, mode: "create" | "edit") {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: string }).message)
      : "";

  if (message.toLowerCase().includes("permission")) {
    return mode === "create"
      ? "You do not have permission to create games."
      : "You do not have permission to update games.";
  }

  if (message.toLowerCase().includes("network")) {
    return "Network error. Please check your connection and try again.";
  }

  if (message.toLowerCase().includes("already taken")) {
    return "That game number is already taken for this league.";
  }

  if (message.toLowerCase().includes("no such game")) {
    return "Game not found.";
  }

  return mode === "create"
    ? "Unable to create game right now. Please try again."
    : "Unable to update game right now. Please try again.";
}

function getShortTeamName(team: TeamOption | undefined) {
  if (!team) {
    return "-";
  }

  return team.teamAbbr || team.teamName || team.id;
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTimestampValue(value: unknown, kind: "date" | "time") {
  if (value instanceof Timestamp) {
    const date = value.toDate();

    if (kind === "date") {
      return date.toISOString().slice(0, 10);
    }

    return date.toTimeString().slice(0, 5);
  }

  if (value instanceof Date) {
    if (kind === "date") {
      return value.toISOString().slice(0, 10);
    }

    return value.toTimeString().slice(0, 5);
  }

  return "";
}

function createPlayerFormValue(playerId: string, existing?: Partial<PlayerFormValue>) {
  return {
    id: playerId,
    included: existing?.included ?? true,
    assists: existing?.assists ?? "0",
    blocks: existing?.blocks ?? "0",
    fouls: existing?.fouls ?? "0",
    freeThrowsAttempted: existing?.freeThrowsAttempted ?? "0",
    freeThrowsMade: existing?.freeThrowsMade ?? "0",
    rebounds: existing?.rebounds ?? "0",
    steals: existing?.steals ?? "0",
    threePointsAttempted: existing?.threePointsAttempted ?? "0",
    threePointsMade: existing?.threePointsMade ?? "0",
    turnovers: existing?.turnovers ?? "0",
    twoPointsAttempted: existing?.twoPointsAttempted ?? "0",
    twoPointsMade: existing?.twoPointsMade ?? "0",
  } satisfies PlayerFormValue;
}

function normalizePlayers(players: PlayerFormValue[]): GamePlayerStats[] {
  return players
    .filter((player) => player.included)
    .map((player) => ({
    id: player.id,
    assists: toNumber(player.assists),
    blocks: toNumber(player.blocks),
    fouls: toNumber(player.fouls),
    freeThrowsAttempted: toNumber(player.freeThrowsAttempted),
    freeThrowsMade: toNumber(player.freeThrowsMade),
    rebounds: toNumber(player.rebounds),
    steals: toNumber(player.steals),
    threePointsAttempted: toNumber(player.threePointsAttempted),
    threePointsMade: toNumber(player.threePointsMade),
    turnovers: toNumber(player.turnovers),
    twoPointsAttempted: toNumber(player.twoPointsAttempted),
    twoPointsMade: toNumber(player.twoPointsMade),
    }));
}

function formatPercentage(made: number, attempt: number) {
  if (!attempt) {
    return "0%";
  }

  return `${((made / attempt) * 100).toFixed(1)}%`;
}

function summarizeTeam(players: GamePlayerStats[]): GameTeamStats {
  const totals = players.reduce(
    (accumulator, player) => {
      accumulator.assists += player.assists;
      accumulator.blocks += player.blocks;
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

  return {
    assists: totals.assists,
    blocks: totals.blocks,
    fieldGoals: {
      attempt: totals.fieldGoalsAttempt,
      made: totals.fieldGoalsMade,
      percentage: formatPercentage(totals.fieldGoalsMade, totals.fieldGoalsAttempt),
    },
    freeThrows: {
      attempt: totals.freeThrowsAttempt,
      made: totals.freeThrowsMade,
      percentage: formatPercentage(totals.freeThrowsMade, totals.freeThrowsAttempt),
    },
    points: totals.points,
    threePoints: {
      attempt: totals.threePointsAttempt,
      made: totals.threePointsMade,
      percentage: formatPercentage(totals.threePointsMade, totals.threePointsAttempt),
    },
    twoPoints: {
      attempt: totals.twoPointsAttempt,
      made: totals.twoPointsMade,
      percentage: formatPercentage(totals.twoPointsMade, totals.twoPointsAttempt),
    },
  };
}

function mergeRosterValues(rosterPlayerIds: string[], currentValues: PlayerFormValue[]) {
  const currentById = new Map(currentValues.map((player) => [player.id, player]));

  return rosterPlayerIds.map((playerId) => {
    const existing = currentById.get(playerId);
    return createPlayerFormValue(playerId, existing);
  });
}

function normalizeImportKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeImportText(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeImportNumber(value: unknown) {
  const text = normalizeImportText(value);

  if (!text) {
    return "0";
  }

  const parsed = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? String(parsed) : "0";
}

type ImportedNameMatch = {
  firstname: string;
  lastname: string;
};

type ParsedHumanName = {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  fullName?: string;
};

function getImportedNameMatches(value: unknown): ImportedNameMatch[] {
  const text = normalizeImportText(value);

  if (!text) {
    return [];
  }

  const parsed = parseName(text) as ParsedHumanName;
  const candidates: ImportedNameMatch[] = [];
  const seen = new Set<string>();

  const addCandidate = (firstname: string, lastname: string) => {
    const normalizedFirstname = firstname.trim();
    const normalizedLastname = lastname.trim();
    const key = `${normalizeImportKey(normalizedFirstname)}|${normalizeImportKey(normalizedLastname)}`;

    if (!normalizedFirstname && !normalizedLastname) {
      return;
    }

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    candidates.push({ firstname: normalizedFirstname, lastname: normalizedLastname });
  };

  const firstName = normalizeImportText(parsed.firstName);
  const middleName = normalizeImportText(parsed.middleName);
  const lastName = normalizeImportText(parsed.lastName);
  const fullName = normalizeImportText(parsed.fullName) || text;

  addCandidate(firstName, lastName);

  if (firstName && middleName && lastName) {
    addCandidate(firstName, `${middleName} ${lastName}`);
    addCandidate(middleName, lastName);
  }

  addCandidate("", fullName);
  addCandidate("", text);

  if (!candidates.length) {
    addCandidate("", text);
  }

  return candidates;
}

function getBestImportedNameMatch(value: unknown, players: PlayerOption[]) {
  const nameMatches = getImportedNameMatches(value);

  for (const nameMatch of nameMatches) {
    const matches = players.filter((player) => {
      const lastnameMatches = normalizeImportKey(player.lastname) === normalizeImportKey(nameMatch.lastname);
      const firstnameMatches = nameMatch.firstname
        ? normalizeImportKey(player.firstname) === normalizeImportKey(nameMatch.firstname)
        : true;

      return lastnameMatches && firstnameMatches;
    });

    if (matches.length) {
      return {
        nameMatch,
        matches,
      };
    }
  }

  return {
    nameMatch: nameMatches[0] ?? null,
    matches: [] as PlayerOption[],
  };
}

function levenshteinDistance(left: string, right: string) {
  const a = normalizeImportKey(left);
  const b = normalizeImportKey(right);

  if (!a.length) {
    return b.length;
  }

  if (!b.length) {
    return a.length;
  }

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];

    for (let column = 1; column <= b.length; column += 1) {
      const substitutionCost = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + substitutionCost,
      );
    }

    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length] ?? Math.max(a.length, b.length);
}

function similarityScore(left: string, right: string) {
  const normalizedLeft = normalizeImportKey(left);
  const normalizedRight = normalizeImportKey(right);

  if (!normalizedLeft && !normalizedRight) {
    return 1;
  }

  const longestLength = Math.max(normalizedLeft.length, normalizedRight.length);

  if (!longestLength) {
    return 0;
  }

  return 1 - levenshteinDistance(normalizedLeft, normalizedRight) / longestLength;
}

function getImportedPlayerCandidates(value: unknown, players: PlayerOption[]) {
  const nameMatches = getImportedNameMatches(value);

  if (!nameMatches.length) {
    return {
      candidates: players.slice(0, 5),
      matchMode: "fuzzy" as PlayerMatchMode,
    };
  }

  for (const nameMatch of nameMatches) {
    const matches = players.filter((player) => {
      const lastnameMatches = normalizeImportKey(player.lastname) === normalizeImportKey(nameMatch.lastname);
      const firstnameMatches = nameMatch.firstname
        ? normalizeImportKey(player.firstname) === normalizeImportKey(nameMatch.firstname)
        : true;

      return lastnameMatches && firstnameMatches;
    });

    if (matches.length === 1) {
      return {
        candidates: matches,
        matchMode: "exact" as PlayerMatchMode,
      };
    }

    if (matches.length > 1) {
      return {
        candidates: matches,
        matchMode: "ambiguous" as PlayerMatchMode,
      };
    }
  }

  const searchTerms = nameMatches
    .flatMap((nameMatch) => [
      [nameMatch.lastname, nameMatch.firstname].filter(Boolean).join(" "),
      [nameMatch.firstname, nameMatch.lastname].filter(Boolean).join(" "),
      nameMatch.lastname,
      nameMatch.firstname,
    ])
    .filter(Boolean);

  const rankedPlayers = players
    .map((player) => {
      const playerTerms = [
        [player.lastname, player.firstname].filter(Boolean).join(" "),
        [player.firstname, player.lastname].filter(Boolean).join(" "),
        player.lastname,
        player.firstname,
      ];

      const bestScore = Math.max(
        ...playerTerms.flatMap((playerTerm) => searchTerms.map((searchTerm) => similarityScore(playerTerm, searchTerm))),
      );

      return {
        player,
        score: bestScore,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map((entry) => entry.player);

  return {
    candidates: rankedPlayers.length ? rankedPlayers : players.slice(0, 5),
    matchMode: "fuzzy" as PlayerMatchMode,
  };
}

function matchSelectedTeam(teamValue: unknown, teamA: TeamOption | undefined, teamB: TeamOption | undefined) {
  const normalizedValue = normalizeImportKey(normalizeImportText(teamValue));

  if (!normalizedValue) {
    return null;
  }

  return [teamA, teamB].find((team) => {
    if (!team) {
      return false;
    }

    return (
      normalizeImportKey(team.id) === normalizedValue ||
      normalizeImportKey(team.teamName) === normalizedValue ||
      normalizeImportKey(team.teamAbbr) === normalizedValue
    );
  }) ?? null;
}

function parseImportedWorkbookRows(file: File, sheetName: string) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      throw new Error(`Spreadsheet "${sheetName}" was not found in the workbook.`);
    }

    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  });
}

function getImportErrorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: string }).message ?? "")
        : String(error ?? "");

  const normalizedMessage = message.trim().toLowerCase();

  if (!normalizedMessage) {
    return "Unable to import the Excel file.";
  }

  if (normalizedMessage.includes("workbook does not contain any sheets")) {
    return "The Excel file is empty or has no worksheets.";
  }

  if (normalizedMessage.includes("failed to parse") || normalizedMessage.includes("invalid array buffer")) {
    return "The selected file is not a readable Excel workbook.";
  }

  if (normalizedMessage.includes("required columns") || normalizedMessage.includes("missing columns")) {
    return "The sheet is missing one or more required columns: #, ID, NAME, 2PM, 2PA, 3PM, 3PA, FTM, FTA, REB, AST, STL, BLK, FLS, TO, PTS, TEAM.";
  }

  return `Unable to import the Excel file: ${message}`;
}

type ImportTemplateRow = Record<(typeof IMPORT_TEMPLATE_HEADERS)[number], string>;

function buildImportTemplateRows(
  teamA: TeamOption | undefined,
  teamB: TeamOption | undefined,
  teamAPlayers: PlayerOption[],
  teamBPlayers: PlayerOption[],
) {
  const buildRows = (team: TeamOption | undefined, roster: PlayerOption[]) =>
    roster.map((player) => ({
      "#": player.number ?? "",
      ID: player.id,
      NAME: [player.lastname, player.firstname].filter(Boolean).join(", "),
      "2PM": "0",
      "2PA": "0",
      "3PM": "0",
      "3PA": "0",
      FTM: "0",
      FTA: "0",
      REB: "0",
      AST: "0",
      STL: "0",
      BLK: "0",
      FLS: "0",
      TO: "0",
      PTS: "0",
      TEAM: team?.teamName ?? team?.id ?? "",
    } satisfies ImportTemplateRow));

  return [...buildRows(teamA, teamAPlayers), ...buildRows(teamB, teamBPlayers)];
}

function buildImportTemplateFilename(teamA: TeamOption | undefined, teamB: TeamOption | undefined, leagueTitle: string) {
  const rawName = `${teamA?.teamAbbr ?? teamA?.teamName ?? "Team A"} vs ${teamB?.teamAbbr ?? teamB?.teamName ?? "Team B"} - ${leagueTitle}`;

  return rawName.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
}

function downloadGameImportTemplate(
  teamA: TeamOption | undefined,
  teamB: TeamOption | undefined,
  leagueTitle: string,
  teamAPlayers: PlayerOption[],
  teamBPlayers: PlayerOption[],
) {
  const rows = buildImportTemplateRows(teamA, teamB, teamAPlayers, teamBPlayers);
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...IMPORT_TEMPLATE_HEADERS] });

  worksheet["!cols"] = IMPORT_TEMPLATE_HEADERS.map((header) => ({
    wch: Math.max(header.length + 2, 12),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Game Import Template");
  XLSX.writeFile(workbook, `${buildImportTemplateFilename(teamA, teamB, leagueTitle)}.xlsx`, { bookType: "xlsx" });
}

function getHeaderValue(row: Record<string, unknown>, labels: string[]) {
  const normalizedRow = new Map(
    Object.entries(row).map(([key, value]) => [normalizeImportKey(key), value]),
  );

  for (const label of labels) {
    const value = normalizedRow.get(normalizeImportKey(label));
    if (value !== undefined) {
      return value;
    }
  }

  return "";
}

function buildImportedRows(
  rows: Record<string, unknown>[],
  teamA: TeamOption | undefined,
  teamB: TeamOption | undefined,
  teamAPlayers: PlayerOption[],
  teamBPlayers: PlayerOption[],
) {
  const jerseyHeaderLabels = ["#", "jersey number", "jersey", "number"];
  const playerIdHeaderLabels = ["ID", "player id", "playerid", "id"];
  const nameHeaderLabels = ["NAME", "Name (lastname, firstname)", "Name", "name"];
  const invalidTeamValues = new Set<string>();

  const importedRows = rows.flatMap((row, rowIndex) => {
    const teamValue = getHeaderValue(row, ["TEAM"]);
    const team = matchSelectedTeam(teamValue, teamA, teamB);

    if (!team) {
      const fallbackLabel = normalizeImportText(teamValue) || `Row ${rowIndex + 2}`;
      invalidTeamValues.add(fallbackLabel);
      return [] as ImportedGameRowWithMatch[];
    }

    const rosterPlayers = team.id === teamA?.id ? teamAPlayers : team.id === teamB?.id ? teamBPlayers : [];
    const playerLookup = new Map(rosterPlayers.map((player) => [player.id, player]));

    const rawPlayerId = normalizeImportText(getHeaderValue(row, playerIdHeaderLabels));
    const nameText = getHeaderValue(row, nameHeaderLabels);
    const playerMatch = getImportedPlayerCandidates(nameText, rosterPlayers);
    const bestNameMatch = getBestImportedNameMatch(nameText, rosterPlayers);

    const uniquePlayer = rawPlayerId ? playerLookup.get(rawPlayerId) ?? null : null;
    const resolvedPlayerId =
      uniquePlayer?.id ??
      (playerMatch.candidates.length === 1 ? playerMatch.candidates[0]?.id ?? null : null);

    const candidates = resolvedPlayerId ? [] : playerMatch.candidates;
    const selectedPlayerId =
      resolvedPlayerId && playerMatch.matchMode === "exact"
        ? resolvedPlayerId
        : null;

    const stats: Record<StatKey, string> = {
      assists: normalizeImportNumber(getHeaderValue(row, ["AST"])),
      blocks: normalizeImportNumber(getHeaderValue(row, ["BLK"])),
      fouls: normalizeImportNumber(getHeaderValue(row, ["FLS"])),
      freeThrowsAttempted: normalizeImportNumber(getHeaderValue(row, ["FTA"])),
      freeThrowsMade: normalizeImportNumber(getHeaderValue(row, ["FTM"])),
      rebounds: normalizeImportNumber(getHeaderValue(row, ["REB"])),
      steals: normalizeImportNumber(getHeaderValue(row, ["STL"])),
      threePointsAttempted: normalizeImportNumber(getHeaderValue(row, ["3PA"])),
      threePointsMade: normalizeImportNumber(getHeaderValue(row, ["3PM"])),
      turnovers: normalizeImportNumber(getHeaderValue(row, ["TO"])),
      twoPointsAttempted: normalizeImportNumber(getHeaderValue(row, ["2PA"])),
      twoPointsMade: normalizeImportNumber(getHeaderValue(row, ["2PM"])),
    };

    return [
      {
        rowIndex,
        teamId: team.id,
        teamLabel: team.teamName,
        jerseyNumber: normalizeImportText(getHeaderValue(row, jerseyHeaderLabels)),
        rawPlayerId,
        lastname: bestNameMatch.nameMatch?.lastname ?? "",
        firstname: bestNameMatch.nameMatch?.firstname ?? "",
        points: normalizeImportNumber(getHeaderValue(row, ["PTS"])),
        stats,
        resolvedPlayerId,
        candidates,
        selectedPlayerId,
        matchMode: uniquePlayer || resolvedPlayerId ? "exact" : playerMatch.matchMode,
      },
    ];
  });

  return {
    rows: importedRows,
    invalidTeamValues: Array.from(invalidTeamValues),
  };
}

export default function GameEditor({
  mode,
  gameId,
}: {
  mode: "create" | "edit";
  gameId?: string;
}) {
  const router = useRouter();
  const form = useForm<GameFormValues>({
    resolver: zodResolver(gameFormSchema),
    defaultValues: EMPTY_FORM_VALUES,
  });
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [importRows, setImportRows] = useState<ImportedGameRowWithMatch[]>([]);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [sheetSelectionOpen, setSheetSelectionOpen] = useState(false);
  const [importingFile, setImportingFile] = useState(false);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [pendingSheetNames, setPendingSheetNames] = useState<string[]>([]);
  const [selectedSheetName, setSelectedSheetName] = useState("");
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const watchedLeagueId = form.watch("leagueId");
  const watchedTeamAId = form.watch("teamAId");
  const watchedTeamBId = form.watch("teamBId");
  const watchedTeamAPlayersValue = useWatch({ control: form.control, name: "teamAPlayers" });
  const watchedTeamBPlayersValue = useWatch({ control: form.control, name: "teamBPlayers" });
  const watchedTeamAPlayers = useMemo(() => watchedTeamAPlayersValue ?? [], [watchedTeamAPlayersValue]);
  const watchedTeamBPlayers = useMemo(() => watchedTeamBPlayersValue ?? [], [watchedTeamBPlayersValue]);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const [leagueDocs, playerDocs, gameDoc] = await Promise.all([
          getLeagues(),
          getAllPlayers(),
          mode === "edit" && gameId ? getGame(gameId) : Promise.resolve(null),
        ]);

        if (cancelled) {
          return;
        }

        setLeagues(
          leagueDocs.map((league) => ({
            id: league.id,
            title: league.title,
            participatingTeams: Array.isArray(league.participatingTeams)
              ? league.participatingTeams
              : Array.isArray(league.participatingteams)
                ? league.participatingteams
                : [],
          })),
        );
        setPlayers(
          playerDocs.map((player) => ({
            id: player.id,
            firstname: player.firstname,
            lastname: player.lastname,
            middlename: player.middlename ?? null,
            number: player.number ?? null,
          })),
        );

        if (mode === "edit" && gameDoc) {
          form.reset({
            leagueId: gameDoc.leagueId ?? "",
            number: String(gameDoc.number ?? ""),
            date: formatTimestampValue(gameDoc.date, "date"),
            time: formatTimestampValue(gameDoc.time, "time"),
            teamAId: gameDoc.teamA?.id ?? "",
            teamBId: gameDoc.teamB?.id ?? "",
            teamAPlayers: Array.isArray(gameDoc.playerStats?.teamA)
              ? gameDoc.playerStats.teamA.map((player) =>
                  createPlayerFormValue(player.id, {
                    assists: String(player.assists ?? 0),
                    blocks: String(player.blocks ?? 0),
                    fouls: String(player.fouls ?? 0),
                    included: true,
                    freeThrowsAttempted: String(player.freeThrowsAttempted ?? 0),
                    freeThrowsMade: String(player.freeThrowsMade ?? 0),
                    rebounds: String(player.rebounds ?? 0),
                    steals: String(player.steals ?? 0),
                    threePointsAttempted: String(player.threePointsAttempted ?? 0),
                    threePointsMade: String(player.threePointsMade ?? 0),
                    turnovers: String(player.turnovers ?? 0),
                    twoPointsAttempted: String(player.twoPointsAttempted ?? 0),
                    twoPointsMade: String(player.twoPointsMade ?? 0),
                  }),
                )
              : [],
            teamBPlayers: Array.isArray(gameDoc.playerStats?.teamB)
              ? gameDoc.playerStats.teamB.map((player) =>
                  createPlayerFormValue(player.id, {
                    assists: String(player.assists ?? 0),
                    blocks: String(player.blocks ?? 0),
                    fouls: String(player.fouls ?? 0),
                    included: true,
                    freeThrowsAttempted: String(player.freeThrowsAttempted ?? 0),
                    freeThrowsMade: String(player.freeThrowsMade ?? 0),
                    rebounds: String(player.rebounds ?? 0),
                    steals: String(player.steals ?? 0),
                    threePointsAttempted: String(player.threePointsAttempted ?? 0),
                    threePointsMade: String(player.threePointsMade ?? 0),
                    turnovers: String(player.turnovers ?? 0),
                    twoPointsAttempted: String(player.twoPointsAttempted ?? 0),
                    twoPointsMade: String(player.twoPointsMade ?? 0),
                  }),
                )
              : [],
          });
        } else if (mode === "create") {
          form.reset(EMPTY_FORM_VALUES);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load game editor data", error);
          setLoadError(getFriendlyErrorMessage(error, mode));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [form, gameId, mode]);

  const selectedLeague = useMemo(
    () => leagues.find((league) => league.id === watchedLeagueId),
    [leagues, watchedLeagueId],
  );

  useEffect(() => {
    let cancelled = false;

    const loadTeams = async () => {
      if (!selectedLeague) {
        setTeams([]);
        form.setValue("teamAId", "", { shouldDirty: true, shouldValidate: true });
        form.setValue("teamBId", "", { shouldDirty: true, shouldValidate: true });
        form.setValue("teamAPlayers", [], { shouldDirty: true, shouldValidate: true });
        form.setValue("teamBPlayers", [], { shouldDirty: true, shouldValidate: true });
        return;
      }

      setLoadingTeams(true);

      try {
        const teamDocs = await getTeamsByIds(selectedLeague.participatingTeams);

        if (cancelled) {
          return;
        }

        const nextTeams = teamDocs.map((team) => ({
          id: team.id,
          teamName: team.teamName,
          teamAbbr: team.teamAbbr,
          players: Array.isArray(team.players) ? team.players : [],
        }));

        setTeams(nextTeams);

        const validTeamIds = new Set(nextTeams.map((team) => team.id));
        const nextTeamAId = validTeamIds.has(form.getValues("teamAId")) ? form.getValues("teamAId") : nextTeams[0]?.id ?? "";
        const nextTeamBId = validTeamIds.has(form.getValues("teamBId")) && form.getValues("teamBId") !== nextTeamAId
          ? form.getValues("teamBId")
          : nextTeams.find((team) => team.id !== nextTeamAId)?.id ?? "";

        form.setValue("teamAId", nextTeamAId, { shouldDirty: true, shouldValidate: true });
        form.setValue("teamBId", nextTeamBId, { shouldDirty: true, shouldValidate: true });
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load league teams for game editor", error);
          setLoadError(getFriendlyErrorMessage(error, mode));
        }
      } finally {
        if (!cancelled) {
          setLoadingTeams(false);
        }
      }
    };

    void loadTeams();

    return () => {
      cancelled = true;
    };
  }, [form, mode, selectedLeague]);

  const teamA = useMemo(() => teams.find((team) => team.id === watchedTeamAId), [teams, watchedTeamAId]);
  const teamB = useMemo(() => teams.find((team) => team.id === watchedTeamBId), [teams, watchedTeamBId]);

  const teamAPlayerOptions = useMemo(() => {
    if (!teamA) {
      return [];
    }

    const rosterIds = new Set(teamA.players ?? []);
    return players.filter((player) => rosterIds.has(player.id));
  }, [players, teamA]);

  const teamBPlayerOptions = useMemo(() => {
    if (!teamB) {
      return [];
    }

    const rosterIds = new Set(teamB.players ?? []);
    return players.filter((player) => rosterIds.has(player.id));
  }, [players, teamB]);

  useEffect(() => {
    if (!teams.length) {
      return;
    }

    if (!teams.some((team) => team.id === watchedTeamAId)) {
      form.setValue("teamAId", teams[0]?.id ?? "", { shouldDirty: true, shouldValidate: true });
    }

    const nextTeamAId = teams.some((team) => team.id === watchedTeamAId)
      ? watchedTeamAId
      : teams[0]?.id ?? "";

    const nextTeamB = teams.find((team) => team.id !== nextTeamAId);
    const teamBValid = teams.some((team) => team.id === watchedTeamBId) && watchedTeamBId !== nextTeamAId;

    if (!teamBValid) {
      form.setValue("teamBId", nextTeamB?.id ?? "", { shouldDirty: true, shouldValidate: true });
    }
  }, [form, teams, watchedTeamAId, watchedTeamBId]);

  useEffect(() => {
    const current = form.getValues("teamAPlayers");
    const rosterIds = teamAPlayerOptions.map((player) => player.id);

    if (!rosterIds.length) {
      return;
    }

    if (current.length === rosterIds.length && current.every((player, index) => player.id === rosterIds[index])) {
      return;
    }

    form.setValue("teamAPlayers", mergeRosterValues(rosterIds, current), { shouldDirty: true, shouldValidate: true });
  }, [form, teamAPlayerOptions]);

  useEffect(() => {
    const current = form.getValues("teamBPlayers");
    const rosterIds = teamBPlayerOptions.map((player) => player.id);

    if (!rosterIds.length) {
      return;
    }

    if (current.length === rosterIds.length && current.every((player, index) => player.id === rosterIds[index])) {
      return;
    }

    form.setValue("teamBPlayers", mergeRosterValues(rosterIds, current), { shouldDirty: true, shouldValidate: true });
  }, [form, teamBPlayerOptions]);

  const teamAStats = useMemo(() => summarizeTeam(normalizePlayers(watchedTeamAPlayers)), [watchedTeamAPlayers]);
  const teamBStats = useMemo(() => summarizeTeam(normalizePlayers(watchedTeamBPlayers)), [watchedTeamBPlayers]);
  const rowsNeedingMatchReview = useMemo(
    () => importRows.filter(requiresPlayerMatchReview),
    [importRows],
  );

  function resetPendingImportSelection() {
    setPendingImportFile(null);
    setPendingSheetNames([]);
    setSelectedSheetName("");
    setSheetSelectionOpen(false);
  }

  function applyImportedRows(rows: ImportedGameRowWithMatch[]) {
    const importedTeamPlayerIds = new Map<RosterFieldName, Set<string>>();

    for (const row of rows) {
      if (!row.resolvedPlayerId || !row.teamId) {
        continue;
      }

      const targetField: RosterFieldName | null = row.teamId === teamA?.id ? "teamAPlayers" : row.teamId === teamB?.id ? "teamBPlayers" : null;

      if (!targetField) {
        continue;
      }

      const currentValues = [...form.getValues(targetField)];
      const nextPlayerValue = createPlayerFormValue(row.resolvedPlayerId, {
        included: true,
        assists: row.stats.assists,
        blocks: row.stats.blocks,
        fouls: row.stats.fouls,
        freeThrowsAttempted: row.stats.freeThrowsAttempted,
        freeThrowsMade: row.stats.freeThrowsMade,
        rebounds: row.stats.rebounds,
        steals: row.stats.steals,
        threePointsAttempted: row.stats.threePointsAttempted,
        threePointsMade: row.stats.threePointsMade,
        turnovers: row.stats.turnovers,
        twoPointsAttempted: row.stats.twoPointsAttempted,
        twoPointsMade: row.stats.twoPointsMade,
      });

      if (!importedTeamPlayerIds.has(targetField)) {
        importedTeamPlayerIds.set(targetField, new Set<string>());
      }

      importedTeamPlayerIds.get(targetField)?.add(row.resolvedPlayerId);

      const existingIndex = currentValues.findIndex((player) => player.id === row.resolvedPlayerId);

      if (existingIndex >= 0) {
        currentValues[existingIndex] = {
          ...currentValues[existingIndex],
          ...nextPlayerValue,
        };
      } else {
        currentValues.push(nextPlayerValue);
      }

      form.setValue(targetField, currentValues, { shouldDirty: true, shouldValidate: true });
    }

    for (const [targetField, importedIds] of importedTeamPlayerIds) {
      const currentValues = form.getValues(targetField);
      const nextValues = currentValues.map((player) => ({
        ...player,
        included: importedIds.has(player.id),
      }));

      form.setValue(targetField, nextValues, { shouldDirty: true, shouldValidate: true });
    }
  }

  async function handleImportFileSelection(file: File) {
    if (!teams.length) {
      toast.error("Choose a league before importing a game sheet.");
      return;
    }

    setImportingFile(true);
    setSubmitError(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetNames = workbook.SheetNames.filter(Boolean);

      if (!sheetNames.length) {
        throw new Error("The workbook does not contain any sheets.");
      }

      setPendingImportFile(file);
      setPendingSheetNames(sheetNames);
      setSelectedSheetName(sheetNames[0] ?? "");
      setSheetSelectionOpen(true);
    } catch (error) {
      console.error("Failed to open import workbook", error);
      toast.error(getImportErrorMessage(error));
    } finally {
      setImportingFile(false);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  }

  async function handleImportSelectedSheet() {
    if (!pendingImportFile || !selectedSheetName) {
      toast.error("Choose a spreadsheet to import.");
      return;
    }

    setImportingFile(true);
    setSubmitError(null);

    try {
      const rows = await parseImportedWorkbookRows(pendingImportFile, selectedSheetName);
      const { rows: importedRows, invalidTeamValues } = buildImportedRows(
        rows,
        teamA,
        teamB,
        teamAPlayerOptions,
        teamBPlayerOptions,
      );

      if (invalidTeamValues.length > 0) {
        const selectedTeamLabels = [teamA, teamB]
          .filter(Boolean)
          .map((team) => team?.teamAbbr || team?.teamName || team?.id)
          .join(" and ");

        throw new Error(
          `The TEAM column must match the selected teams (${selectedTeamLabels}). Invalid values: ${invalidTeamValues.join(", ")}.`,
        );
      }

      if (!importedRows.length) {
        throw new Error("No importable rows were found in the selected spreadsheet.");
      }

      const unresolvedRows = importedRows.filter(requiresPlayerMatchReview);

      setImportRows(importedRows);
      setImportFileName(pendingImportFile.name);
      setImportDialogOpen(unresolvedRows.length > 0);

      if (unresolvedRows.length > 0) {
        toast.success(
          `Imported ${importedRows.length} rows. ${unresolvedRows.length} player match${unresolvedRows.length === 1 ? "" : "es"} need review.`,
        );
        return;
      }

      applyImportedRows(importedRows);
      toast.success(`Imported ${importedRows.length} player${importedRows.length === 1 ? "" : "s"} from ${pendingImportFile.name}.`);
    } catch (error) {
      console.error("Failed to import game Excel file", error);
      toast.error(getImportErrorMessage(error));
    } finally {
      setImportingFile(false);
      resetPendingImportSelection();
    }
  }

  function confirmImportMatches() {
    const finalRows = importRows
      .map((row) => ({
        ...row,
        resolvedPlayerId: row.resolvedPlayerId ?? row.selectedPlayerId,
      }))
      .filter((row): row is ImportedGameRowWithMatch & { resolvedPlayerId: string } => Boolean(row.resolvedPlayerId));

    applyImportedRows(finalRows);
    setImportRows([]);
    setImportDialogOpen(false);
    toast.success(`Imported ${finalRows.length} matched player${finalRows.length === 1 ? "" : "s"}${importFileName ? ` from ${importFileName}` : ""}.`);
  }

  async function handleSubmit(values: GameFormSchema) {
    if (!values.teamAPlayers.length || !values.teamBPlayers.length) {
      setSubmitError("Both teams need player stats before saving the game.");
      return;
    }

    setSubmitError(null);

    const payload = {
      leagueId: values.leagueId,
      number: Number(values.number),
      date: values.date,
      time: values.time,
      teamAId: values.teamAId,
      teamAPlayers: normalizePlayers(values.teamAPlayers),
      teamBId: values.teamBId,
      teamBPlayers: normalizePlayers(values.teamBPlayers),
    };

    try {
      if (mode === "edit") {
        if (!gameId) {
          throw new Error("Game not found.");
        }

        await updateGame(gameId, payload);
        toast.success("Game updated.");
      } else {
        await createGame(payload);
        toast.success("Game created.");
      }

      router.push("/games");
    } catch (error) {
      console.error("Failed to save game", error);
      const friendlyMessage = getFriendlyErrorMessage(error, mode);
      setSubmitError(friendlyMessage);
      toast.error(friendlyMessage);
    }
  }

  async function handleDelete() {
    if (mode !== "edit" || !gameId) {
      return;
    }

    setSubmitError(null);

    try {
      await deleteGame(gameId);
      toast.success("Game deleted.");
      router.push("/games");
    } catch (error) {
      console.error("Failed to delete game", error);
      const friendlyMessage = getFriendlyErrorMessage(error, mode);
      setSubmitError(friendlyMessage);
      toast.error(friendlyMessage);
    }
  }

  if (loading) {
    return <WholePageLoading />;
  }

  if (loadError) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 md:p-8">
        <section className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">{mode === "create" ? "New Game" : "Update Game"}</h1>
          <p className="mt-2 text-sm text-slate-600">Unable to load the game editor.</p>
          <p className="mt-4 text-sm text-red-600">{loadError}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push("/games")}>Back to Games</Button>
          </div>
        </section>
      </main>
    );
  }

  const pageTitle = mode === "create" ? "New Game" : "Update Game";
  const pageDescription =
    mode === "create"
      ? "Create a new game record and mirror the team and player game records."
      : "Edit an existing game record and sync the linked subcollection documents.";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#f8fafc,#e2e8f0_55%,#cbd5e1)] px-4 py-8 md:px-8">
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 px-6 py-8 text-white shadow-2xl shadow-slate-950/15 md:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-slate-300">
                Games
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{pageTitle}</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-300 md:text-base">{pageDescription}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                className="text-gray-800"
                onClick={() => importInputRef.current?.click()}
                disabled={importingFile || loadingTeams || !watchedLeagueId}
              >
                {importingFile ? "Importing..." : "Import Excel"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-gray-800"
                onClick={() => downloadGameImportTemplate(teamA, teamB, selectedLeague?.title ?? "League", teamAPlayerOptions, teamBPlayerOptions)}
                disabled={!watchedLeagueId || !teamA || !teamB}
              >
                Download Template
              </Button>
              <Button type="button" variant="outline" className="text-gray-800" onClick={() => router.push("/games")}>
                Back to Games
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">League</p>
              <p className="mt-1 text-white">{selectedLeague?.title || "Select a league"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Teams</p>
              <p className="mt-1 text-white">{getShortTeamName(teamA)} vs {getShortTeamName(teamB)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Players</p>
              <p className="mt-1 text-white">{watchedTeamAPlayers.length + watchedTeamBPlayers.length}</p>
            </div>
          </div>
        </header>

        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleImportFileSelection(file);
            }
          }}
        />

        {sheetSelectionOpen && pendingSheetNames.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/25">
              <div className="border-b border-slate-200 px-6 py-5">
                <h2 className="text-xl font-semibold text-slate-950">Choose worksheet</h2>
                <p className="mt-1 text-sm text-slate-600">
                  The workbook contains multiple sheets. Select the spreadsheet that has the game stats to import.
                </p>
                {pendingImportFile ? <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{pendingImportFile.name}</p> : null}
              </div>

              <div className="space-y-3 px-6 py-5">
                <label className="block text-sm font-medium text-slate-700" htmlFor="worksheet-select">
                  Spreadsheet
                </label>
                <select
                  id="worksheet-select"
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                  value={selectedSheetName}
                  onChange={(event) => setSelectedSheetName(event.target.value)}
                >
                  {pendingSheetNames.map((sheetName) => (
                    <option key={sheetName} value={sheetName}>
                      {sheetName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetPendingImportSelection();
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={() => void handleImportSelectedSheet()} disabled={!selectedSheetName || importingFile}>
                  Use Spreadsheet
                </Button>
              </div>
            </div>
          </div>
        )}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/5 md:p-8"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="leagueId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>League</FormLabel>
                    <FormControl>
                      <select
                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                        {...field}
                      >
                        <option value="">Select a league</option>
                        {leagues.map((league) => (
                          <option key={league.id} value={league.id}>
                            {league.title}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Game Number</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="1"
                        {...field}
                        onChange={(event) => field.onChange(event.target.value.replace(/\D/g, ""))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="teamAId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team A</FormLabel>
                    <FormControl>
                      <select
                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                        {...field}
                      >
                        <option value="">Select team A</option>
                        {teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.teamName} ({team.teamAbbr || team.id})
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="teamBId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team B</FormLabel>
                    <FormControl>
                      <select
                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                        {...field}
                      >
                        <option value="">Select team B</option>
                        {teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.teamName} ({team.teamAbbr || team.id})
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <TeamPlayerEditor
                title="Team A Players"
                subtitle={teamA ? `${teamA.teamName} roster` : "Select Team A to load players"}
                players={teamAPlayerOptions}
                fieldPrefix="teamAPlayers"
                form={form}
                disabled={!watchedLeagueId || loadingTeams}
              />
              <TeamPlayerEditor
                title="Team B Players"
                subtitle={teamB ? `${teamB.teamName} roster` : "Select Team B to load players"}
                players={teamBPlayerOptions}
                fieldPrefix="teamBPlayers"
                form={form}
                disabled={!watchedLeagueId || loadingTeams}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <TeamSummaryCard title="Team A Summary" team={teamA} stats={teamAStats} />
              <TeamSummaryCard title="Team B Summary" team={teamB} stats={teamBStats} />
            </div>

            {submitError && <p className="text-sm font-medium text-red-600">{submitError}</p>}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => router.push("/games")} disabled={form.formState.isSubmitting}>
                Cancel
              </Button>
              {mode === "edit" && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner className="size-4" />
                      Deleting...
                    </span>
                  ) : (
                    "Delete Game"
                  )}
                </Button>
              )}
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="size-4" />
                    Saving...
                  </span>
                ) : mode === "create" ? (
                  "Create Game"
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        </Form>

        {importDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-5xl rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/25">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">Resolve imported player matches</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    The sheet contained players with shared or missing player ids. Choose the right system player for each row before applying the import.
                  </p>
                  {importFileName ? <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{importFileName}</p> : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setImportDialogOpen(false);
                    setImportRows([]);
                  }}
                >
                  Close
                </Button>
              </div>

              <div className="max-h-[65vh] space-y-4 overflow-auto px-6 py-5">
                {rowsNeedingMatchReview.map((row) => (
                  <article key={row.rowIndex} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                          <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.2em] text-white">
                            Row {row.rowIndex + 2}
                          </span>
                          <span>{row.teamLabel}</span>
                          {row.jerseyNumber ? <span>Jersey {row.jerseyNumber}</span> : null}
                          {row.rawPlayerId ? <span>Player id {row.rawPlayerId}</span> : null}
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-slate-950">
                            {row.lastname || "Unknown"}{row.firstname ? `, ${row.firstname}` : ""}
                          </p>
                          <p className="text-sm text-slate-600">PTS {row.points}</p>
                        </div>
                        <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2 xl:grid-cols-4">
                          <ImportStat label="2PM" value={row.stats.twoPointsMade} />
                          <ImportStat label="2PA" value={row.stats.twoPointsAttempted} />
                          <ImportStat label="3PM" value={row.stats.threePointsMade} />
                          <ImportStat label="3PA" value={row.stats.threePointsAttempted} />
                          <ImportStat label="FTM" value={row.stats.freeThrowsMade} />
                          <ImportStat label="FTA" value={row.stats.freeThrowsAttempted} />
                          <ImportStat label="REB" value={row.stats.rebounds} />
                          <ImportStat label="AST" value={row.stats.assists} />
                          <ImportStat label="STL" value={row.stats.steals} />
                          <ImportStat label="BLK" value={row.stats.blocks} />
                          <ImportStat label="FLS" value={row.stats.fouls} />
                          <ImportStat label="TO" value={row.stats.turnovers} />
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-sm font-medium text-slate-700">Match player</p>
                        <select
                          className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                          value={row.selectedPlayerId ?? ""}
                          onChange={(event) => {
                            const nextPlayerId = event.target.value || null;
                            setImportRows((currentRows) =>
                              currentRows.map((currentRow) =>
                                currentRow.rowIndex === row.rowIndex
                                  ? {
                                      ...currentRow,
                                      selectedPlayerId: nextPlayerId,
                                    }
                                  : currentRow,
                              ),
                            );
                          }}
                        >
                          {row.candidates.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.lastname}, {candidate.firstname}
                              {candidate.number ? ` #${candidate.number}` : ""}
                            </option>
                          ))}
                        </select>
                        <p className="mt-2 text-xs text-slate-500">
                          {row.matchMode === "fuzzy"
                            ? "No exact match was found. Pick the closest suggested player or choose the correct one manually."
                            : row.candidates.length > 1
                              ? "Multiple players share this last name. Pick the correct one."
                              : "No player id was supplied, so this match was inferred from the last name."}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setImportDialogOpen(false);
                    setImportRows([]);
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={confirmImportMatches} disabled={!importRows.length}>
                  Apply Import
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function ImportStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-slate-900">{value}</p>
    </div>
  );
}

function TeamPlayerEditor({
  title,
  subtitle,
  players,
  fieldPrefix,
  form,
  disabled,
}: {
  title: string;
  subtitle: string;
  players: PlayerOption[];
  fieldPrefix: "teamAPlayers" | "teamBPlayers";
  form: ReturnType<typeof useForm<GameFormValues>>;
  disabled: boolean;
}) {
  const selectedPlayers = form.watch(fieldPrefix);

  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4 space-y-1">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="text-sm text-slate-600">{subtitle}</p>
      </div>

      {!players.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
          {disabled ? "Choose a league first to load the available teams and players." : "No players available for this team yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {selectedPlayers.map((player, index) => {
            const rosterPlayer = players.find((item) => item.id === player.id);
            const playerName = rosterPlayer
              ? [rosterPlayer.lastname, rosterPlayer.firstname].filter(Boolean).join(", ")
              : player.id;

            return (
              <article key={`${fieldPrefix}-${player.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-950">{playerName}</p>
                    <p className="text-xs text-slate-500">Player ID: {player.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {rosterPlayer?.number && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        No. {rosterPlayer.number}
                      </span>
                    )}
                    <Button
                      type="button"
                      variant={player.included ? "outline" : "default"}
                      size="sm"
                      disabled={disabled}
                      onClick={() => {
                        form.setValue(
                          `${fieldPrefix}.${index}.included`,
                          !player.included,
                          { shouldDirty: true, shouldValidate: true },
                        );
                      }}
                    >
                      {player.included ? "Exclude from game" : "Include in game"}
                    </Button>
                  </div>
                </div>

                <div className={player.included ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3 opacity-50"}>
                  {STAT_KEYS.map((statKey) => (
                    <FormField
                      key={`${fieldPrefix}-${player.id}-${statKey}`}
                      control={form.control}
                      name={`${fieldPrefix}.${index}.${statKey}` as const}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs uppercase tracking-[0.18em] text-slate-500">
                            {humanizeStatKey(statKey)}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              inputMode="numeric"
                              className="h-9"
                              disabled={disabled || !player.included}
                              {...field}
                              onChange={(event) => field.onChange(event.target.value.replace(/\D/g, ""))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TeamSummaryCard({
  title,
  team,
  stats,
}: {
  title: string;
  team: TeamOption | undefined;
  stats: GameTeamStats;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-950 p-4 text-white shadow-sm">
      <div className="mb-4 space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-slate-300">{team ? `${team.teamName} summary` : "Waiting for team selection"}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryStat label="Points" value={stats.points} />
        <SummaryStat label="Assists" value={stats.assists} />
        <SummaryStat label="Blocks" value={stats.blocks} />
        <SummaryStat label="Field Goals" value={`${stats.fieldGoals.made}/${stats.fieldGoals.attempt} (${stats.fieldGoals.percentage})`} />
        <SummaryStat label="Free Throws" value={`${stats.freeThrows.made}/${stats.freeThrows.attempt} (${stats.freeThrows.percentage})`} />
        <SummaryStat label="3 Points" value={`${stats.threePoints.made}/${stats.threePoints.attempt} (${stats.threePoints.percentage})`} />
        <SummaryStat label="2 Points" value={`${stats.twoPoints.made}/${stats.twoPoints.attempt} (${stats.twoPoints.percentage})`} />
      </div>
    </section>
  );
}

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function humanizeStatKey(statKey: StatKey) {
  const labels: Record<StatKey, string> = {
    assists: "Assists",
    blocks: "Blocks",
    fouls: "Fouls",
    freeThrowsAttempted: "FT Attempted",
    freeThrowsMade: "FT Made",
    rebounds: "Rebounds",
    steals: "Steals",
    threePointsAttempted: "3PT Attempted",
    threePointsMade: "3PT Made",
    turnovers: "Turnovers",
    twoPointsAttempted: "2PT Attempted",
    twoPointsMade: "2PT Made",
  };

  return labels[statKey];
}
