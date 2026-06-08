"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Timestamp } from "firebase/firestore";
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

/** Stat columns that must not be blank in every import row. */
const REQUIRED_STAT_HEADERS = ["2PM", "2PA", "3PM", "3PA", "FTM", "FTA", "REB", "AST", "STL", "BLK", "FLS", "TO", "PTS"] as const;

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

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Import types — new simplified flow
// ---------------------------------------------------------------------------

/**
 * A single parsed row from the Excel sheet before player resolution.
 */
type ImportedGameRow = {
  /** 0-based index in the raw rows array (Excel row = rowIndex + 2). */
  rowIndex: number;
  /** Resolved team id, or null if the TEAM cell didn't match either team. */
  teamId: string | null;
  teamLabel: string;
  jerseyNumber: string;
  /** Raw value from the NAME column. */
  rawName: string;
  /** Extracted lastname (used for matching). */
  lastname: string;
  /** Extracted firstname (display only). */
  firstname: string;
  points: string;
  stats: Record<StatKey, string>;
};

/**
 * A row after the lastname-only matching step has been applied.
 *
 * matchMode:
 *  - "exact"     → exactly one player in the team roster has this lastname
 *  - "ambiguous" → 2+ players share this lastname (user must pick)
 *  - "none"      → no roster player has this lastname (user must pick from unmatched pool)
 */
type PlayerMatchMode = "exact" | "ambiguous" | "none";

type ImportedGameRowWithMatch = ImportedGameRow & {
  /** The auto-resolved player id (only set when matchMode === "exact"). */
  resolvedPlayerId: string | null;
  /** Candidates shown to the user in the picker. */
  candidates: PlayerOption[];
  /** The player id the user has chosen (or the auto-resolved one). */
  selectedPlayerId: string | null;
  matchMode: PlayerMatchMode;
};

function requiresPlayerMatchReview(row: ImportedGameRowWithMatch) {
  return row.matchMode !== "exact";
}

// ---------------------------------------------------------------------------
// Form schema
// ---------------------------------------------------------------------------

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
  assists: z.coerce.string().default("0"),
  blocks: z.coerce.string().default("0"),
  fouls: z.coerce.string().default("0"),
  freeThrowsAttempted: z.coerce.string().default("0"),
  freeThrowsMade: z.coerce.string().default("0"),
  rebounds: z.coerce.string().default("0"),
  steals: z.coerce.string().default("0"),
  threePointsAttempted: z.coerce.string().default("0"),
  threePointsMade: z.coerce.string().default("0"),
  turnovers: z.coerce.string().default("0"),
  twoPointsAttempted: z.coerce.string().default("0"),
  twoPointsMade: z.coerce.string().default("0"),
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

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

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
  if (!team) return "-";
  return team.teamAbbr || team.teamName || team.id;
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTimestampValue(value: unknown, kind: "date" | "time") {
  if (value instanceof Timestamp) {
    const date = value.toDate();
    return kind === "date" ? date.toISOString().slice(0, 10) : date.toTimeString().slice(0, 5);
  }
  if (value instanceof Date) {
    return kind === "date" ? value.toISOString().slice(0, 10) : value.toTimeString().slice(0, 5);
  }
  return "";
}

function createPlayerFormValue(playerId: string, existing?: Partial<PlayerFormValue>): PlayerFormValue {
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
  };
}

function normalizePlayers(players: PlayerFormValue[]): GamePlayerStats[] {
  return players
    .filter((p) => p.included)
    .map((p) => ({
      id: p.id,
      assists: toNumber(p.assists),
      blocks: toNumber(p.blocks),
      fouls: toNumber(p.fouls),
      freeThrowsAttempted: toNumber(p.freeThrowsAttempted),
      freeThrowsMade: toNumber(p.freeThrowsMade),
      rebounds: toNumber(p.rebounds),
      steals: toNumber(p.steals),
      threePointsAttempted: toNumber(p.threePointsAttempted),
      threePointsMade: toNumber(p.threePointsMade),
      turnovers: toNumber(p.turnovers),
      twoPointsAttempted: toNumber(p.twoPointsAttempted),
      twoPointsMade: toNumber(p.twoPointsMade),
    }));
}

function formatPercentage(made: number, attempt: number) {
  if (!attempt) return "0%";
  return `${((made / attempt) * 100).toFixed(1)}%`;
}

function summarizeTeam(players: GamePlayerStats[]): GameTeamStats {
  const totals = players.reduce(
    (acc, p) => {
      acc.assists += p.assists;
      acc.blocks += p.blocks;
      acc.points += p.threePointsMade * 3 + p.twoPointsMade * 2 + p.freeThrowsMade;
      acc.fouls += p.fouls;
      acc.rebounds += p.rebounds;
      acc.steals += p.steals;
      acc.turnovers += p.turnovers;
      acc.fieldGoalsAttempt += p.twoPointsAttempted + p.threePointsAttempted;
      acc.fieldGoalsMade += p.twoPointsMade + p.threePointsMade;
      acc.freeThrowsAttempt += p.freeThrowsAttempted;
      acc.freeThrowsMade += p.freeThrowsMade;
      acc.threePointsAttempt += p.threePointsAttempted;
      acc.threePointsMade += p.threePointsMade;
      acc.twoPointsAttempt += p.twoPointsAttempted;
      acc.twoPointsMade += p.twoPointsMade;
      return acc;
    },
    {
      assists: 0,
      blocks: 0,
      points: 0,
      fouls: 0,
      rebounds: 0,
      steals: 0,
      turnovers: 0,
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
    fouls: totals.fouls,
    rebounds: totals.rebounds,
    turnovers: totals.turnovers,
    steals: totals.steals,
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
  const currentById = new Map(currentValues.map((p) => [p.id, p]));
  return rosterPlayerIds.map((id) => createPlayerFormValue(id, currentById.get(id)));
}

// ---------------------------------------------------------------------------
// Import helpers — new flow
// ---------------------------------------------------------------------------

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeNumber(value: unknown) {
  const text = normalizeText(value);
  if (!text) return null; // null signals "blank"
  const parsed = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? String(parsed) : null;
}

function getHeaderValue(row: Record<string, unknown>, labels: string[]) {
  const normalizedRow = new Map(Object.entries(row).map(([k, v]) => [normalizeKey(k), v]));
  for (const label of labels) {
    const value = normalizedRow.get(normalizeKey(label));
    if (value !== undefined) return value;
  }
  return "";
}

/**
 * Parses a raw name cell into { lastname, firstname }.
 * Accepted formats:
 *   - "lastname"
 *   - "firstname lastname"
 *   - "lastname, firstname"
 */
function parseName(raw: unknown): { lastname: string; firstname: string } {
  const text = normalizeText(raw);

  if (!text) return { lastname: "", firstname: "" };

  // "lastname, firstname"
  if (text.includes(",")) {
    const [last = "", first = ""] = text.split(",").map((s) => s.trim());
    return { lastname: last, firstname: first };
  }

  // "firstname lastname" (two or more words → last word is lastname)
  const parts = text.split(/\s+/);
  if (parts.length >= 2) {
    const lastname = parts[parts.length - 1] ?? "";
    const firstname = parts.slice(0, parts.length - 1).join(" ");
    return { lastname, firstname };
  }

  // single word → treat as lastname
  return { lastname: text, firstname: "" };
}

/**
 * Matches a single TEAM cell value against the two selected teams.
 * Returns the matching TeamOption or null.
 */
function matchTeam(teamValue: unknown, teamA: TeamOption | undefined, teamB: TeamOption | undefined): TeamOption | null {
  const v = normalizeKey(normalizeText(teamValue));
  if (!v) return null;
  return (
    [teamA, teamB].find((t) => {
      if (!t) return false;
      return (
        normalizeKey(t.id) === v ||
        normalizeKey(t.teamName) === v ||
        normalizeKey(t.teamAbbr) === v
      );
    }) ?? null
  );
}

/**
 * Matches a parsed lastname against a team's player roster (lastname-only matching).
 */
function matchByLastname(lastname: string, roster: PlayerOption[]): { mode: PlayerMatchMode; candidates: PlayerOption[]; resolved: string | null } {
  const normalized = normalizeKey(lastname);
  if (!normalized) {
    return { mode: "none", candidates: roster, resolved: null };
  }

  const matches = roster.filter((p) => normalizeKey(p.lastname) === normalized);

  if (matches.length === 1) {
    return { mode: "exact", candidates: [], resolved: matches[0]!.id };
  }
  if (matches.length > 1) {
    return { mode: "ambiguous", candidates: matches, resolved: null };
  }
  return { mode: "none", candidates: roster, resolved: null };
}

// ---------------------------------------------------------------------------
// STEP 1 — Validate teams
// ---------------------------------------------------------------------------

type TeamValidationResult =
  | { ok: true; teamARows: Record<string, unknown>[]; teamBRows: Record<string, unknown>[] }
  | { ok: false; error: string };

function validateTeams(
  rows: Record<string, unknown>[],
  teamA: TeamOption | undefined,
  teamB: TeamOption | undefined,
): TeamValidationResult {
  if (!teamA || !teamB) {
    return { ok: false, error: "Both teams must be selected before importing." };
  }

  const teamsFound = new Set<string>();
  const invalidValues = new Set<string>();

  for (const row of rows) {
    const teamValue = normalizeText(getHeaderValue(row, ["TEAM"]));
    const matched = matchTeam(teamValue, teamA, teamB);
    if (matched) {
      teamsFound.add(matched.id);
    } else {
      invalidValues.add(teamValue || "(blank)");
    }
  }

  if (invalidValues.size > 0) {
    const validLabels = [teamA, teamB]
      .map((t) => t.teamAbbr || t.teamName || t.id)
      .join(" and ");
    return {
      ok: false,
      error: `TEAM column contains values that don't match the selected teams (${validLabels}). Invalid values: ${Array.from(invalidValues).join(", ")}.`,
    };
  }

  if (teamsFound.size < 2) {
    const missing = [teamA, teamB]
      .filter((t) => !teamsFound.has(t.id))
      .map((t) => t.teamAbbr || t.teamName || t.id)
      .join(", ");
    return {
      ok: false,
      error: `The sheet must contain rows for both teams. Missing: ${missing}.`,
    };
  }

  const teamARows = rows.filter((r) => matchTeam(getHeaderValue(r, ["TEAM"]), teamA, teamB)?.id === teamA.id);
  const teamBRows = rows.filter((r) => matchTeam(getHeaderValue(r, ["TEAM"]), teamA, teamB)?.id === teamB.id);

  return { ok: true, teamARows, teamBRows };
}

// ---------------------------------------------------------------------------
// STEP 2 — Validate blank cells
// ---------------------------------------------------------------------------

type BlankCellError = { excelRow: number; column: string };

function validateBlankCells(rows: Record<string, unknown>[]): BlankCellError[] {
  const errors: BlankCellError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const excelRow = i + 2; // header is row 1

    // NAME must not be blank
    const name = normalizeText(getHeaderValue(row, ["NAME"]));
    if (!name) {
      errors.push({ excelRow, column: "NAME" });
    }

    // TEAM must not be blank
    const team = normalizeText(getHeaderValue(row, ["TEAM"]));
    if (!team) {
      errors.push({ excelRow, column: "TEAM" });
    }

    // All stat columns must not be blank
    for (const header of REQUIRED_STAT_HEADERS) {
      const raw = getHeaderValue(row, [header]);
      if (normalizeNumber(raw) === null) {
        errors.push({ excelRow, column: header });
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// STEP 3 — Build rows with lastname-only matching
// ---------------------------------------------------------------------------

function buildImportedRows(
  rows: Record<string, unknown>[],
  teamA: TeamOption,
  teamB: TeamOption,
  teamAPlayers: PlayerOption[],
  teamBPlayers: PlayerOption[],
): ImportedGameRowWithMatch[] {
  return rows.map((row, rowIndex) => {
    const team = matchTeam(getHeaderValue(row, ["TEAM"]), teamA, teamB)!; // already validated
    const roster = team.id === teamA.id ? teamAPlayers : teamBPlayers;

    const rawName = normalizeText(getHeaderValue(row, ["NAME"]));
    const { lastname, firstname } = parseName(rawName);
    const { mode, candidates, resolved } = matchByLastname(lastname, roster);

    const stats: Record<StatKey, string> = {
      assists: normalizeNumber(getHeaderValue(row, ["AST"])) ?? "0",
      blocks: normalizeNumber(getHeaderValue(row, ["BLK"])) ?? "0",
      fouls: normalizeNumber(getHeaderValue(row, ["FLS"])) ?? "0",
      freeThrowsAttempted: normalizeNumber(getHeaderValue(row, ["FTA"])) ?? "0",
      freeThrowsMade: normalizeNumber(getHeaderValue(row, ["FTM"])) ?? "0",
      rebounds: normalizeNumber(getHeaderValue(row, ["REB"])) ?? "0",
      steals: normalizeNumber(getHeaderValue(row, ["STL"])) ?? "0",
      threePointsAttempted: normalizeNumber(getHeaderValue(row, ["3PA"])) ?? "0",
      threePointsMade: normalizeNumber(getHeaderValue(row, ["3PM"])) ?? "0",
      turnovers: normalizeNumber(getHeaderValue(row, ["TO"])) ?? "0",
      twoPointsAttempted: normalizeNumber(getHeaderValue(row, ["2PA"])) ?? "0",
      twoPointsMade: normalizeNumber(getHeaderValue(row, ["2PM"])) ?? "0",
    };

    return {
      rowIndex,
      teamId: team.id,
      teamLabel: team.teamName,
      jerseyNumber: normalizeText(getHeaderValue(row, ["#", "jersey number", "jersey", "number"])),
      rawName,
      lastname,
      firstname,
      points: normalizeNumber(getHeaderValue(row, ["PTS"])) ?? "0",
      stats,
      resolvedPlayerId: resolved,
      candidates,
      selectedPlayerId: resolved, // pre-select the resolved one; user can override
      matchMode: mode,
    };
  });
}

// ---------------------------------------------------------------------------
// Template helpers (unchanged from original)
// ---------------------------------------------------------------------------

type ImportTemplateRow = Record<(typeof IMPORT_TEMPLATE_HEADERS)[number], string>;

function buildImportTemplateRows(
  teamA: TeamOption | undefined,
  teamB: TeamOption | undefined,
  teamAPlayers: PlayerOption[],
  teamBPlayers: PlayerOption[],
) {
  const buildRows = (team: TeamOption | undefined, roster: PlayerOption[]) =>
    roster.map(
      (player) =>
        ({
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
        }) satisfies ImportTemplateRow,
    );

  return [...buildRows(teamA, teamAPlayers), ...buildRows(teamB, teamBPlayers)];
}

function buildImportTemplateFilename(teamA: TeamOption | undefined, teamB: TeamOption | undefined, leagueTitle: string) {
  const rawName = `${teamA?.teamAbbr ?? teamA?.teamName ?? "Team A"} vs ${teamB?.teamAbbr ?? teamB?.teamName ?? "Team B"} - ${leagueTitle}`;
  return rawName
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
  worksheet["!cols"] = IMPORT_TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 12) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Game Import Template");
  XLSX.writeFile(workbook, `${buildImportTemplateFilename(teamA, teamB, leagueTitle)}.xlsx`, { bookType: "xlsx" });
}

function parseWorkbookRows(file: File, sheetName: string) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`Spreadsheet "${sheetName}" was not found in the workbook.`);
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

  const norm = message.trim().toLowerCase();
  if (!norm) return "Unable to import the Excel file.";
  if (norm.includes("workbook does not contain any sheets")) return "The Excel file is empty or has no worksheets.";
  if (norm.includes("failed to parse") || norm.includes("invalid array buffer"))
    return "The selected file is not a readable Excel workbook.";
  return `Unable to import the Excel file: ${message}`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function GameEditor({ mode, gameId }: { mode: "create" | "edit"; gameId?: string }) {
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

  // Import state
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

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

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

        if (cancelled) return;

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
          playerDocs.map((p) => ({
            id: p.id,
            firstname: p.firstname,
            lastname: p.lastname,
            middlename: p.middlename ?? null,
            number: p.number ?? null,
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
              ? gameDoc.playerStats.teamA.map((p) =>
                  createPlayerFormValue(p.id, {
                    included: true,
                    assists: String(p.assists ?? 0),
                    blocks: String(p.blocks ?? 0),
                    fouls: String(p.fouls ?? 0),
                    freeThrowsAttempted: String(p.freeThrowsAttempted ?? 0),
                    freeThrowsMade: String(p.freeThrowsMade ?? 0),
                    rebounds: String(p.rebounds ?? 0),
                    steals: String(p.steals ?? 0),
                    threePointsAttempted: String(p.threePointsAttempted ?? 0),
                    threePointsMade: String(p.threePointsMade ?? 0),
                    turnovers: String(p.turnovers ?? 0),
                    twoPointsAttempted: String(p.twoPointsAttempted ?? 0),
                    twoPointsMade: String(p.twoPointsMade ?? 0),
                  }),
                )
              : [],
            teamBPlayers: Array.isArray(gameDoc.playerStats?.teamB)
              ? gameDoc.playerStats.teamB.map((p) =>
                  createPlayerFormValue(p.id, {
                    included: true,
                    assists: String(p.assists ?? 0),
                    blocks: String(p.blocks ?? 0),
                    fouls: String(p.fouls ?? 0),
                    freeThrowsAttempted: String(p.freeThrowsAttempted ?? 0),
                    freeThrowsMade: String(p.freeThrowsMade ?? 0),
                    rebounds: String(p.rebounds ?? 0),
                    steals: String(p.steals ?? 0),
                    threePointsAttempted: String(p.threePointsAttempted ?? 0),
                    threePointsMade: String(p.threePointsMade ?? 0),
                    turnovers: String(p.turnovers ?? 0),
                    twoPointsAttempted: String(p.twoPointsAttempted ?? 0),
                    twoPointsMade: String(p.twoPointsMade ?? 0),
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
        if (!cancelled) setLoading(false);
      }
    };

    void loadData();
    return () => { cancelled = true; };
  }, [form, gameId, mode]);

  const selectedLeague = useMemo(
    () => leagues.find((l) => l.id === watchedLeagueId),
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
        if (cancelled) return;

        const nextTeams = teamDocs.map((t) => ({
          id: t.id,
          teamName: t.teamName,
          teamAbbr: t.teamAbbr,
          players: Array.isArray(t.players) ? t.players : [],
        }));

        setTeams(nextTeams);

        const validIds = new Set(nextTeams.map((t) => t.id));
        const nextTeamAId =
          validIds.has(form.getValues("teamAId")) ? form.getValues("teamAId") : nextTeams[0]?.id ?? "";
        const nextTeamBId =
          validIds.has(form.getValues("teamBId")) && form.getValues("teamBId") !== nextTeamAId
            ? form.getValues("teamBId")
            : nextTeams.find((t) => t.id !== nextTeamAId)?.id ?? "";

        form.setValue("teamAId", nextTeamAId, { shouldDirty: true, shouldValidate: true });
        form.setValue("teamBId", nextTeamBId, { shouldDirty: true, shouldValidate: true });
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load league teams", error);
          setLoadError(getFriendlyErrorMessage(error, mode));
        }
      } finally {
        if (!cancelled) setLoadingTeams(false);
      }
    };

    void loadTeams();
    return () => { cancelled = true; };
  }, [form, mode, selectedLeague]);

  const teamA = useMemo(() => teams.find((t) => t.id === watchedTeamAId), [teams, watchedTeamAId]);
  const teamB = useMemo(() => teams.find((t) => t.id === watchedTeamBId), [teams, watchedTeamBId]);

  const teamAPlayerOptions = useMemo(() => {
    if (!teamA) return [];
    const ids = new Set(teamA.players ?? []);
    return players.filter((p) => ids.has(p.id));
  }, [players, teamA]);

  const teamBPlayerOptions = useMemo(() => {
    if (!teamB) return [];
    const ids = new Set(teamB.players ?? []);
    return players.filter((p) => ids.has(p.id));
  }, [players, teamB]);

  useEffect(() => {
    if (!teams.length) return;
    if (!teams.some((t) => t.id === watchedTeamAId)) {
      form.setValue("teamAId", teams[0]?.id ?? "", { shouldDirty: true, shouldValidate: true });
    }
    const nextTeamAId = teams.some((t) => t.id === watchedTeamAId) ? watchedTeamAId : teams[0]?.id ?? "";
    const teamBValid = teams.some((t) => t.id === watchedTeamBId) && watchedTeamBId !== nextTeamAId;
    if (!teamBValid) {
      form.setValue(
        "teamBId",
        teams.find((t) => t.id !== nextTeamAId)?.id ?? "",
        { shouldDirty: true, shouldValidate: true },
      );
    }
  }, [form, teams, watchedTeamAId, watchedTeamBId]);

  useEffect(() => {
    const current = form.getValues("teamAPlayers");
    const ids = teamAPlayerOptions.map((p) => p.id);
    if (!ids.length) return;
    if (current.length === ids.length && current.every((p, i) => p.id === ids[i])) return;
    form.setValue("teamAPlayers", mergeRosterValues(ids, current), { shouldDirty: true, shouldValidate: true });
  }, [form, teamAPlayerOptions]);

  useEffect(() => {
    const current = form.getValues("teamBPlayers");
    const ids = teamBPlayerOptions.map((p) => p.id);
    if (!ids.length) return;
    if (current.length === ids.length && current.every((p, i) => p.id === ids[i])) return;
    form.setValue("teamBPlayers", mergeRosterValues(ids, current), { shouldDirty: true, shouldValidate: true });
  }, [form, teamBPlayerOptions]);

  const teamAStats = useMemo(() => summarizeTeam(normalizePlayers(watchedTeamAPlayers)), [watchedTeamAPlayers]);
  const teamBStats = useMemo(() => summarizeTeam(normalizePlayers(watchedTeamBPlayers)), [watchedTeamBPlayers]);

  const rowsNeedingMatchReview = useMemo(
    () => importRows.filter(requiresPlayerMatchReview),
    [importRows],
  );

  // -------------------------------------------------------------------------
  // Import: computed "unmatched players" pool for "none" rows
  // -------------------------------------------------------------------------

  /**
   * For a given team, the pool of players who have NOT yet been claimed by an
   * "exact" or manually selected row. Used as the candidate list for rows
   * where no lastname match was found.
   */
  const unmatchedPlayerPool = useMemo(() => {
    const claimedA = new Set<string>();
    const claimedB = new Set<string>();

    for (const row of importRows) {
      const claimed = row.selectedPlayerId ?? row.resolvedPlayerId;
      if (!claimed) continue;
      if (row.teamId === teamA?.id) claimedA.add(claimed);
      else if (row.teamId === teamB?.id) claimedB.add(claimed);
    }

    return {
      [teamA?.id ?? ""]: teamAPlayerOptions.filter((p) => !claimedA.has(p.id)),
      [teamB?.id ?? ""]: teamBPlayerOptions.filter((p) => !claimedB.has(p.id)),
    };
  }, [importRows, teamA, teamB, teamAPlayerOptions, teamBPlayerOptions]);

  // -------------------------------------------------------------------------
  // Import: sheet selection helpers
  // -------------------------------------------------------------------------

  function resetPendingImport() {
    setPendingImportFile(null);
    setPendingSheetNames([]);
    setSelectedSheetName("");
    setSheetSelectionOpen(false);
  }

  // -------------------------------------------------------------------------
  // Import: apply resolved rows into form
  // -------------------------------------------------------------------------

  function applyImportedRows(rows: ImportedGameRowWithMatch[]) {
    const importedByTeam = new Map<RosterFieldName, Set<string>>();

    for (const row of rows) {
      const finalId = row.resolvedPlayerId ?? row.selectedPlayerId;
      if (!finalId || !row.teamId) continue;

      const targetField: RosterFieldName | null =
        row.teamId === teamA?.id ? "teamAPlayers" : row.teamId === teamB?.id ? "teamBPlayers" : null;
      if (!targetField) continue;

      const currentValues = [...form.getValues(targetField)];
      const nextValue = createPlayerFormValue(finalId, {
        included: true,
        ...row.stats,
      });

      if (!importedByTeam.has(targetField)) importedByTeam.set(targetField, new Set());
      importedByTeam.get(targetField)!.add(finalId);

      const existingIndex = currentValues.findIndex((p) => p.id === finalId);
      if (existingIndex >= 0) {
        currentValues[existingIndex] = { ...currentValues[existingIndex], ...nextValue };
      } else {
        currentValues.push(nextValue);
      }

      form.setValue(targetField, currentValues, { shouldDirty: true, shouldValidate: true });
    }

    // Mark players not in the import as excluded
    for (const [targetField, importedIds] of importedByTeam) {
      const currentValues = form.getValues(targetField);
      form.setValue(
        targetField,
        currentValues.map((p) => ({ ...p, included: importedIds.has(p.id) })),
        { shouldDirty: true, shouldValidate: true },
      );
    }
  }

  // -------------------------------------------------------------------------
  // Import: file selection (open sheet picker)
  // -------------------------------------------------------------------------

  async function handleImportFileSelection(file: File) {
    if (!watchedLeagueId) {
      toast.error("Choose a league before importing a game sheet.");
      return;
    }
    if (!teamA || !teamB) {
      toast.error("Select both teams before importing a game sheet.");
      return;
    }

    setImportingFile(true);
    setSubmitError(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetNames = workbook.SheetNames.filter(Boolean);
      if (!sheetNames.length) throw new Error("The workbook does not contain any sheets.");

      setPendingImportFile(file);
      setPendingSheetNames(sheetNames);
      setSelectedSheetName(sheetNames[0] ?? "");
      setSheetSelectionOpen(true);
    } catch (error) {
      console.error("Failed to open import workbook", error);
      toast.error(getImportErrorMessage(error));
    } finally {
      setImportingFile(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  // -------------------------------------------------------------------------
  // Import: run the three-step validation then build rows
  // -------------------------------------------------------------------------

  async function handleImportSelectedSheet() {
    if (!pendingImportFile || !selectedSheetName) {
      toast.error("Choose a spreadsheet to import.");
      return;
    }
    if (!teamA || !teamB) {
      toast.error("Select both teams before importing.");
      return;
    }

    setImportingFile(true);
    setSubmitError(null);

    try {
      const rows = await parseWorkbookRows(pendingImportFile, selectedSheetName);

      if (!rows.length) {
        toast.error("No rows were found in the selected spreadsheet.");
        return;
      }

      // ── STEP 1: Team validation ──────────────────────────────────────────
      const teamResult = validateTeams(rows, teamA, teamB);
      if (!teamResult.ok) {
        toast.error(teamResult.error);
        return;
      }

      // ── STEP 2: Blank cell validation ───────────────────────────────────
      const blankErrors = validateBlankCells(rows);
      if (blankErrors.length > 0) {
        // Show the first few errors in the toast for clarity
        const preview = blankErrors.slice(0, 3);
        const remaining = blankErrors.length - preview.length;
        const detail = preview
          .map((e) => `Row ${e.excelRow}, column ${e.column}`)
          .join("; ");
        const suffix = remaining > 0 ? `; and ${remaining} more` : "";
        toast.error(`Blank cells found — fix them and re-import. ${detail}${suffix}.`);
        return;
      }

      // ── STEP 3: Build rows with lastname-only matching ───────────────────
      const importedRows = buildImportedRows(rows, teamA, teamB, teamAPlayerOptions, teamBPlayerOptions);
      const needsReview = importedRows.filter(requiresPlayerMatchReview);

      setImportRows(importedRows);
      setImportFileName(pendingImportFile.name);

      if (needsReview.length > 0) {
        setImportDialogOpen(true);
        toast.success(
          `${importedRows.length} rows loaded — ${needsReview.length} player match${needsReview.length === 1 ? "" : "es"} need review.`,
        );
      } else {
        // All rows matched exactly — apply immediately
        applyImportedRows(importedRows);
        toast.success(
          `Imported ${importedRows.length} player${importedRows.length === 1 ? "" : "s"} from ${pendingImportFile.name}.`,
        );
        setImportRows([]);
      }
    } catch (error) {
      console.error("Failed to import game Excel file", error);
      toast.error(getImportErrorMessage(error));
    } finally {
      setImportingFile(false);
      resetPendingImport();
    }
  }

  // -------------------------------------------------------------------------
  // Import: confirm manual matches and apply
  // -------------------------------------------------------------------------

  function confirmImportMatches() {
    // All rows must have a selectedPlayerId before proceeding
    const unresolved = rowsNeedingMatchReview.filter((r) => !r.selectedPlayerId);
    if (unresolved.length > 0) {
      toast.error(
        `${unresolved.length} row${unresolved.length === 1 ? "" : "s"} still ${unresolved.length === 1 ? "has" : "have"} no player selected. Please pick a match for every row.`,
      );
      return;
    }

    const finalRows = importRows.map((r) => ({
      ...r,
      resolvedPlayerId: r.resolvedPlayerId ?? r.selectedPlayerId,
    }));

    applyImportedRows(finalRows);
    setImportRows([]);
    setImportDialogOpen(false);
    toast.success(
      `Imported ${finalRows.length} player${finalRows.length === 1 ? "" : "s"}${importFileName ? ` from ${importFileName}` : ""}.`,
    );
  }

  // -------------------------------------------------------------------------
  // Form submit / delete
  // -------------------------------------------------------------------------

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
        if (!gameId) throw new Error("Game not found.");
        await updateGame(gameId, payload);
        toast.success("Game updated.");
      } else {
        await createGame(payload);
        toast.success("Game created.");
      }
      router.push("/games");
    } catch (error) {
      console.error("Failed to save game", error);
      const msg = getFriendlyErrorMessage(error, mode);
      setSubmitError(msg);
      toast.error(msg);
    }
  }

  async function handleDelete() {
    if (mode !== "edit" || !gameId) return;
    setSubmitError(null);
    try {
      await deleteGame(gameId);
      toast.success("Game deleted.");
      router.push("/games");
    } catch (error) {
      console.error("Failed to delete game", error);
      const msg = getFriendlyErrorMessage(error, mode);
      setSubmitError(msg);
      toast.error(msg);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) return <WholePageLoading />;

  if (loadError) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 md:p-8">
        <section className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">{mode === "create" ? "New Game" : "Update Game"}</h1>
          <p className="mt-2 text-sm text-slate-600">Unable to load the game editor.</p>
          <p className="mt-4 text-sm text-red-600">{loadError}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push("/games")}>
              Back to Games
            </Button>
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
        {/* ── Header ───────────────────────────────────────────────────── */}
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
                {importingFile ? "Importing…" : "Import Excel"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-gray-800"
                onClick={() =>
                  downloadGameImportTemplate(
                    teamA,
                    teamB,
                    selectedLeague?.title ?? "League",
                    teamAPlayerOptions,
                    teamBPlayerOptions,
                  )
                }
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
              <p className="mt-1 text-white">
                {getShortTeamName(teamA)} vs {getShortTeamName(teamB)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Players</p>
              <p className="mt-1 text-white">{watchedTeamAPlayers.length + watchedTeamBPlayers.length}</p>
            </div>
          </div>
        </header>

        {/* Hidden file input */}
        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportFileSelection(file);
          }}
        />

        {/* ── Sheet picker dialog ───────────────────────────────────────── */}
        {sheetSelectionOpen && pendingSheetNames.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/25">
              <div className="border-b border-slate-200 px-6 py-5">
                <h2 className="text-xl font-semibold text-slate-950">Choose worksheet</h2>
                <p className="mt-1 text-sm text-slate-600">
                  The workbook has multiple sheets. Select the one that contains the game stats.
                </p>
                {pendingImportFile && (
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{pendingImportFile.name}</p>
                )}
              </div>

              <div className="space-y-3 px-6 py-5">
                <label className="block text-sm font-medium text-slate-700" htmlFor="worksheet-select">
                  Spreadsheet
                </label>
                <select
                  id="worksheet-select"
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                  value={selectedSheetName}
                  onChange={(e) => setSelectedSheetName(e.target.value)}
                >
                  {pendingSheetNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
                <Button type="button" variant="outline" onClick={resetPendingImport}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleImportSelectedSheet()}
                  disabled={!selectedSheetName || importingFile}
                >
                  {importingFile ? "Importing…" : "Use Spreadsheet"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Main form ────────────────────────────────────────────────── */}
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
                        {leagues.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.title}
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
                        onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ""))}
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
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.teamName} ({t.teamAbbr || t.id})
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
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.teamName} ({t.teamAbbr || t.id})
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
                <Button type="button" variant="destructive" onClick={handleDelete} disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner className="size-4" />
                      Deleting…
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
                    Saving…
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

        {/* ── Player match review dialog ────────────────────────────────── */}
        {importDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-5xl rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/25">
              {/* Dialog header */}
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">Resolve player matches</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Some rows could not be matched automatically. Assign the correct player for each row before applying the import.
                  </p>
                  {importFileName && (
                    <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{importFileName}</p>
                  )}
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

              {/* Rows */}
              <div className="max-h-[65vh] space-y-4 overflow-auto px-6 py-5">
                {rowsNeedingMatchReview.map((row) => {
                  const poolForRow = unmatchedPlayerPool[row.teamId ?? ""] ?? [];
                  /**
                   * Candidates to show in the picker:
                   *  - "ambiguous" → the 2+ players who share the lastname
                   *  - "none"      → players in the team who haven't been claimed yet
                   */
                  const pickerCandidates = row.matchMode === "ambiguous" ? row.candidates : poolForRow;

                  return (
                    <article key={row.rowIndex} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
                        {/* Left: row info */}
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.2em] text-white">
                              Row {row.rowIndex + 2}
                            </span>
                            <span>{row.teamLabel}</span>
                            {row.jerseyNumber && <span>Jersey #{row.jerseyNumber}</span>}
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                row.matchMode === "ambiguous"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {row.matchMode === "ambiguous" ? "Multiple matches" : "No match found"}
                            </span>
                          </div>

                          <div>
                            <p className="text-lg font-semibold text-slate-950">
                              {row.rawName || "(blank name)"}
                            </p>
                            <p className="text-sm text-slate-500">
                              Lastname detected: <span className="font-medium text-slate-700">{row.lastname || "—"}</span>
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

                        {/* Right: player picker */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-sm font-medium text-slate-700">
                            {row.matchMode === "ambiguous"
                              ? "Multiple players share this last name — pick the correct one"
                              : "No player matched — select from the remaining unmatched players"}
                          </p>

                          {pickerCandidates.length === 0 ? (
                            <p className="mt-3 text-sm text-slate-500 italic">
                              No unmatched players remaining for this team.
                            </p>
                          ) : (
                            <select
                              className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                              value={row.selectedPlayerId ?? ""}
                              onChange={(e) => {
                                const nextId = e.target.value || null;
                                setImportRows((prev) =>
                                  prev.map((r) =>
                                    r.rowIndex === row.rowIndex
                                      ? { ...r, selectedPlayerId: nextId }
                                      : r,
                                  ),
                                );
                              }}
                            >
                              <option value="">— Select a player —</option>
                              {pickerCandidates.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.lastname}, {c.firstname}
                                  {c.number ? ` #${c.number}` : ""}
                                </option>
                              ))}
                            </select>
                          )}

                          {!row.selectedPlayerId && (
                            <p className="mt-2 text-xs font-medium text-red-600">A player must be selected.</p>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Dialog footer */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-6 py-4">
                <p className="text-sm text-slate-500">
                  {rowsNeedingMatchReview.filter((r) => r.selectedPlayerId).length} of {rowsNeedingMatchReview.length} resolved
                </p>
                <div className="flex gap-2">
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
                  <Button
                    type="button"
                    onClick={confirmImportMatches}
                    disabled={rowsNeedingMatchReview.some((r) => !r.selectedPlayerId)}
                  >
                    Apply Import
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-components (unchanged API, same visual style)
// ---------------------------------------------------------------------------

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
          {disabled
            ? "Choose a league first to load the available teams and players."
            : "No players available for this team yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {selectedPlayers.map((player, index) => {
            const rosterPlayer = players.find((p) => p.id === player.id);
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
                        form.setValue(`${fieldPrefix}.${index}.included`, !player.included, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }}
                    >
                      {player.included ? "Exclude from game" : "Include in game"}
                    </Button>
                  </div>
                </div>

                <div
                  className={
                    player.included
                      ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
                      : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3 opacity-50"
                  }
                >
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
                              onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ""))}
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

function TeamSummaryCard({ title, team, stats }: { title: string; team: TeamOption | undefined; stats: GameTeamStats }) {
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
        <SummaryStat
          label="Field Goals"
          value={`${stats.fieldGoals.made}/${stats.fieldGoals.attempt} (${stats.fieldGoals.percentage})`}
        />
        <SummaryStat
          label="Free Throws"
          value={`${stats.freeThrows.made}/${stats.freeThrows.attempt} (${stats.freeThrows.percentage})`}
        />
        <SummaryStat
          label="3 Points"
          value={`${stats.threePoints.made}/${stats.threePoints.attempt} (${stats.threePoints.percentage})`}
        />
        <SummaryStat
          label="2 Points"
          value={`${stats.twoPoints.made}/${stats.twoPoints.attempt} (${stats.twoPoints.percentage})`}
        />
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