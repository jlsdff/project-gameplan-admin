"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { serverTimestamp } from "firebase/firestore";
import {
  CalendarDays,
  Check,
  Image as ImageIcon,
  ImageUp,
  MapPin,
  RefreshCw,
  Save,
  Shield,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { WholePageLoading } from "@/components/ui/wholepage-loading";
import { useAuth } from "@/context/Authcontext";
import { getLeague, updateLeague } from "@/lib/leagues/crud";
import { listStoredImages, uploadStoredImage } from "@/lib/storage/images";
import { getTeams } from "@/lib/teams/crud";
import { League } from "@/types/models";
import type { OutputData } from "@editorjs/editorjs";

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const LEAGUE_STATUSES = ["Ongoing", "Finished"] as const;

const leagueFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required."),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format."),
  venue: z.string().trim(),
  leagueImage: z.string().trim().min(1, "League image is required."),
  timeFrom: z.union([
    z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM in 24-hour time."),
    z.literal(""),
  ]),
  timeTo: z.union([
    z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM in 24-hour time."),
    z.literal(""),
  ]),
  status: z.enum(LEAGUE_STATUSES),
  dateSchedule: z.array(z.string()),
  participatingTeams: z.array(z.string()).min(1, "Pick at least one participating team."),
});

type LeagueFormValues = z.infer<typeof leagueFormSchema>;
type TeamOption = { id: string; teamName: string; teamAbbr: string };
type StoredImage = { fullPath: string; name: string; url: string; originalName: string };

function normalizeEditorData(value: unknown): OutputData {
  if (value && typeof value === "object") {
    const candidate = value as Partial<OutputData> & Record<string, unknown>;

    if (Array.isArray(candidate.blocks)) {
      return {
        time: typeof candidate.time === "number" ? candidate.time : Date.now(),
        blocks: candidate.blocks,
        version: typeof candidate.version === "string" ? candidate.version : undefined,
      };
    }
  }

  return {
    time: Date.now(),
    blocks: [],
  };
}

const INITIAL_VALUES: LeagueFormValues = {
  title: "",
  startDate: "",
  venue: "",
  leagueImage: "",
  timeFrom: "",
  timeTo: "",
  status: "Ongoing",
  dateSchedule: [],
  participatingTeams: [],
};

function getFriendlyImageErrorMessage(error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: string }).message)
      : "";

  if (message.toLowerCase().includes("permission")) {
    return "You do not have permission to manage league images.";
  }

  if (message.toLowerCase().includes("network")) {
    return "Network error. Please check your connection and try again.";
  }

  return "Unable to load league images right now. Please try again.";
}

function getFriendlyLeagueErrorMessage(error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: string }).message)
      : "";

  if (message.toLowerCase().includes("permission")) {
    return "You do not have permission to update leagues.";
  }

  if (message.toLowerCase().includes("network")) {
    return "Network error. Please check your connection and try again.";
  }

  if (message.toLowerCase().includes("no such league")) {
    return "League not found.";
  }

  return "Unable to update league right now. Please try again.";
}

export default function EditLeaguePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const leagueId = typeof params.id === "string" ? params.id : "";
  const { user, loading: authLoading } = useAuth();
  const form = useForm<LeagueFormValues>({
    resolver: zodResolver(leagueFormSchema),
    defaultValues: INITIAL_VALUES,
  });
  const editorHolderRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<import("@editorjs/editorjs").default | null>(null);
  const [league, setLeague] = useState<(League & { id: string }) | null>(null);
  const [loadingLeague, setLoadingLeague] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [images, setImages] = useState<StoredImage[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(true);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageInputKey, setImageInputKey] = useState(0);
  const [isImageSheetOpen, setIsImageSheetOpen] = useState(false);
  const [teamSearch, setTeamSearch] = useState("");
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [imagesError, setImagesError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editorReady, setEditorReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadTeams = async () => {
      try {
        const teamDocs = await getTeams();

        if (cancelled) {
          return;
        }

        setTeams(
          teamDocs.map((team) => ({
            id: team.id,
            teamName: team.teamName,
            teamAbbr: team.teamAbbr,
          })),
        );
        setTeamsError(null);
      } catch {
        if (!cancelled) {
          setTeamsError("Unable to load teams right now.");
        }
      }
    };

    void loadTeams();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadLeague = async () => {
      if (!leagueId) {
        if (!cancelled) {
          setLoadError("League not found.");
          setLoadingLeague(false);
        }
        return;
      }

      setLoadingLeague(true);
      setLoadError(null);

      try {
        const leagueDoc = await getLeague(leagueId);

        if (cancelled) {
          return;
        }

        const nextLeague = { ...leagueDoc, id: leagueId };
        setLeague(nextLeague);
        form.reset({
          title: nextLeague.title ?? "",
          startDate: nextLeague.startDate ?? "",
          venue: nextLeague.venue ?? "",
          leagueImage: nextLeague.leagueImage ?? "",
          timeFrom: nextLeague.timeFrom ?? "",
          timeTo: nextLeague.timeTo ?? "",
          status: nextLeague.status ?? "Ongoing",
          dateSchedule: Array.isArray(nextLeague.dateSchedule) ? nextLeague.dateSchedule : [],
          participatingTeams: Array.isArray(nextLeague.participatingTeams)
            ? nextLeague.participatingTeams
            : Array.isArray(nextLeague.participatingteams)
              ? nextLeague.participatingteams
              : [],
        });
      } catch (error) {
        if (!cancelled) {
          setLoadError(getFriendlyLeagueErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setLoadingLeague(false);
        }
      }
    };

    void loadLeague();

    return () => {
      cancelled = true;
    };
  }, [form, leagueId]);

  useEffect(() => {
    let cancelled = false;

    const loadImages = async () => {
      setImagesError(null);
      setIsLoadingImages(true);

      try {
        const storedImages = await listStoredImages();

        if (cancelled) {
          return;
        }

        setImages(storedImages);
      } catch (error) {
        if (!cancelled) {
          setImagesError(getFriendlyImageErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingImages(false);
        }
      }
    };

    void loadImages();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initializeEditor = async () => {
      if (!league || !editorHolderRef.current) {
        return;
      }

      const { default: EditorJS } = await import("@editorjs/editorjs");

      if (cancelled) {
        return;
      }

      editorRef.current = new EditorJS({
        holder: editorHolderRef.current,
        placeholder: "Write league notes, rules, or format details...",
        data: normalizeEditorData(league.leagueData),
      });
      setEditorReady(true);
    };

    void initializeEditor();

    return () => {
      cancelled = true;
      editorRef.current?.destroy();
      editorRef.current = null;
      setEditorReady(false);
    };
  }, [league]);

  const selectedDays = form.watch("dateSchedule");
  const selectedLeagueImage = form.watch("leagueImage");
  const visibleTeams = useMemo(() => {
    const query = teamSearch.trim().toLowerCase();

    if (!query) {
      return teams;
    }

    return teams.filter((team) => {
      return (
        team.teamName.toLowerCase().includes(query) ||
        team.teamAbbr.toLowerCase().includes(query)
      );
    });
  }, [teamSearch, teams]);
  const selectedTeamIds = form.watch("participatingTeams");
  const selectedTeams = useMemo(
    () =>
      selectedTeamIds.map(
        (teamId) => teams.find((team) => team.id === teamId) ?? { id: teamId, teamName: teamId, teamAbbr: "" },
      ),
    [selectedTeamIds, teams],
  );

  function toggleDay(day: string) {
    const currentDays = form.getValues("dateSchedule");
    form.setValue(
      "dateSchedule",
      currentDays.includes(day)
        ? currentDays.filter((item) => item !== day)
        : [...currentDays, day],
      { shouldDirty: true, shouldValidate: true },
    );
  }

  function toggleTeam(teamId: string) {
    const currentTeams = form.getValues("participatingTeams");
    form.setValue(
      "participatingTeams",
      currentTeams.includes(teamId)
        ? currentTeams.filter((item) => item !== teamId)
        : [...currentTeams, teamId],
      { shouldDirty: true, shouldValidate: true },
    );
  }

  async function refreshImages() {
    setImagesError(null);
    setIsLoadingImages(true);

    try {
      const storedImages = await listStoredImages();
      setImages(storedImages);
    } catch (error) {
      setImagesError(getFriendlyImageErrorMessage(error));
    } finally {
      setIsLoadingImages(false);
    }
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      setImageInputKey((current) => current + 1);
      return;
    }

    setImagesError(null);
    setIsUploadingImage(true);

    try {
      const uploadedImage = await uploadStoredImage(file);
      setImages((current) => [uploadedImage, ...current]);
      form.setValue("leagueImage", uploadedImage.url, { shouldDirty: true, shouldValidate: true });
      toast.success("Image uploaded and selected.");
    } catch (error) {
      const message = getFriendlyImageErrorMessage(error);
      setImagesError(message);
      toast.error(message);
    } finally {
      setIsUploadingImage(false);
      setImageInputKey((current) => current + 1);
    }
  }

  function selectLeagueImage(imageUrl: string) {
    form.setValue("leagueImage", imageUrl, { shouldDirty: true, shouldValidate: true });
  }

  async function handleSubmit(values: LeagueFormValues) {
    setSubmitError(null);

    if (!league) {
      const message = "League not found.";
      setSubmitError(message);
      toast.error(message);
      return;
    }

    if (!user?.uid) {
      const message = "You must be signed in to update a league.";
      setSubmitError(message);
      toast.error(message);
      return;
    }

    if (!editorRef.current) {
      const message = "Editor is still loading. Please try again in a moment.";
      setSubmitError(message);
      toast.error(message);
      return;
    }

    try {
      const leagueData = (await editorRef.current.save()) as OutputData;
      const payload: League = {
        createAt: league.createAt,
        createdBy: league.createdBy,
        dateSchedule: values.dateSchedule,
        leagueData: leagueData as unknown as Record<string, unknown>,
        leagueImage: values.leagueImage.trim(),
        participatingTeams: values.participatingTeams,
        startDate: values.startDate,
        status: values.status,
        timeFrom: values.timeFrom,
        timeTo: values.timeTo,
        title: values.title.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        venue: values.venue.trim(),
      };

      await updateLeague(league.id, payload);
      toast.success("League updated.");
      router.push("/leagues");
    } catch (error: unknown) {
      const message = getFriendlyLeagueErrorMessage(error);
      setSubmitError(message);
      toast.error(message);
    }
  }

  if (authLoading || loadingLeague) {
    return <WholePageLoading />;
  }

  if (loadError) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#f8fafc,#e2e8f0_55%,#cbd5e1)] px-4 py-8 md:px-8">
        <section className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/5">
          <h1 className="text-2xl font-semibold text-slate-950">Edit League</h1>
          <p className="mt-2 text-sm text-slate-600">Unable to load this league.</p>
          <p className="mt-4 text-sm text-rose-700">{loadError}</p>
          <div className="mt-6 flex justify-end">
            <Button type="button" variant="outline" onClick={() => router.push("/leagues")}>Back to Leagues</Button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#f8fafc,#e2e8f0_55%,#cbd5e1)] px-4 py-8 md:px-8">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 px-6 py-8 text-white shadow-2xl shadow-slate-950/15 md:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-slate-300">
                <Shield className="size-3.5" />
                League Builder
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Edit League</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-300 md:text-base">
                  Update the league document, chosen media image, schedule, teams, and EditorJS content.
                </p>
              </div>
            </div>

            <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Created by</p>
                <p className="mt-1 break-all text-white">{league?.createdBy ?? "-"}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Teams loaded</p>
                <p className="mt-1 text-white">{teams.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Editor status</p>
                <p className="mt-1 text-white">{editorReady ? "Ready" : "Loading"}</p>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/5">
            <Form {...form}>
              <form className="space-y-6" onSubmit={form.handleSubmit(handleSubmit)}>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input placeholder="Summer Championship" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="leagueImage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>League Cover Image</FormLabel>
                        <FormControl>
                          <Input type="hidden" {...field} />
                        </FormControl>
                        <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-slate-900">Choose from media library</p>
                              <p className="text-sm text-slate-600">
                                Open the popup to pick a stored image or upload a new one.
                              </p>
                            </div>
                            <Button type="button" onClick={() => setIsImageSheetOpen(true)}>
                              <ImageUp className="size-4" />
                              Open media picker
                            </Button>
                          </div>

                          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                            <div>
                              <p className="text-sm font-medium text-slate-900">Selected image</p>
                              <p className="break-all text-sm text-slate-600">
                                {selectedLeagueImage || "No image selected yet."}
                              </p>
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={() => setIsImageSheetOpen(true)}>
                              Change
                            </Button>
                          </div>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="timeFrom"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Time From (optional)</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="timeTo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Time To (optional)</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="venue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Venue (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Main court / stadium / arena" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <FormControl>
                        <select
                          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none ring-offset-white focus:border-slate-400"
                          value={field.value}
                          onChange={field.onChange}
                        >
                          {LEAGUE_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    <CalendarDays className="size-4 text-slate-500" />
                    Date Schedule (optional)
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {DAYS_OF_WEEK.map((day) => (
                      <label
                        key={day}
                        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 transition hover:border-slate-300"
                      >
                        <Checkbox checked={selectedDays.includes(day)} onCheckedChange={() => toggleDay(day)} />
                        {day}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">Leave this empty if the league schedule is not set yet.</p>
                  {form.formState.errors.dateSchedule?.message && (
                    <p className="text-sm font-medium text-destructive">
                      {form.formState.errors.dateSchedule.message}
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    <Users className="size-4 text-slate-500" />
                    Participating Teams
                  </div>

                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1">
                        <Input
                          value={teamSearch}
                          onChange={(event) => setTeamSearch(event.target.value)}
                          placeholder="Search teams by name or abbreviation"
                        />
                      </div>
                      {teamSearch && (
                        <Button type="button" variant="outline" onClick={() => setTeamSearch("")}>Clear</Button>
                      )}
                    </div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Showing {visibleTeams.length} of {teams.length} team{teams.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  {teamsError && <p className="text-sm text-amber-700">{teamsError}</p>}

                  <div className="max-h-72 space-y-2 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    {visibleTeams.length ? (
                      visibleTeams.map((team) => (
                        <label
                          key={team.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-transparent bg-white px-4 py-3 text-sm transition hover:border-slate-300"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-slate-900">{team.teamName}</span>
                            <span className="block text-xs uppercase tracking-[0.16em] text-slate-500">{team.teamAbbr}</span>
                          </span>
                          <Checkbox
                            checked={selectedTeamIds.includes(team.id)}
                            onCheckedChange={() => toggleTeam(team.id)}
                          />
                        </label>
                      ))
                    ) : teamSearch ? (
                      <p className="px-2 py-3 text-sm text-slate-500">No teams match your search.</p>
                    ) : (
                      <p className="px-2 py-3 text-sm text-slate-500">No teams available yet.</p>
                    )}
                  </div>
                  {form.formState.errors.participatingTeams?.message && (
                    <p className="text-sm font-medium text-destructive">
                      {form.formState.errors.participatingTeams.message}
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    <ImageIcon className="size-4 text-slate-500" />
                    League Data
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    <div ref={editorHolderRef} className="min-h-64 px-4 py-4" />
                  </div>
                  <p className="text-xs text-slate-500">
                    This content is saved as the raw EditorJS document in <span className="font-medium">leagueData</span>.
                  </p>
                </div>

                {submitError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{submitError}</p>}

                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
                  <Button type="button" variant="outline" onClick={() => router.push("/leagues")}>Cancel</Button>
                  <Button type="submit" disabled={form.formState.isSubmitting || !editorReady}>
                    <Save className="size-4" />
                    {form.formState.isSubmitting ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </Form>
          </div>

          <aside className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Preview</h2>
              <p className="mt-1 text-sm text-slate-600">Selected values before saving.</p>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-950 p-4 text-white">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Title</p>
                <p className="mt-1 text-lg font-semibold">{form.watch("title") || "League title"}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Schedule</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {selectedDays.length ? selectedDays.join(", ") : "No days selected"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Teams</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {selectedTeams.length ? `${selectedTeams.length} team(s)` : "No teams selected"}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <MapPin className="size-4 text-slate-500" />
                  Venue
                </div>
                <p className="mt-2 text-sm text-slate-700">{form.watch("venue") || "Venue will appear here."}</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Image</p>
                <p className="mt-1 break-all text-sm text-slate-700">
                  {selectedLeagueImage || "Select an uploaded media image or upload one above."}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <Sheet open={isImageSheetOpen} onOpenChange={setIsImageSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="pr-10">
            <SheetTitle>League media picker</SheetTitle>
            <SheetDescription>
              Select an uploaded image for the league cover, or upload a new image if the one you want is not here yet.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 px-4 pb-6">
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="block">
                <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Upload new image
                </span>
                <Input
                  key={imageInputKey}
                  type="file"
                  accept="image/*"
                  disabled={isUploadingImage}
                  onChange={(event) => void handleImageUpload(event)}
                  className="cursor-pointer file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
                />
              </label>

              {isUploadingImage && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Spinner />
                  Uploading image...
                </div>
              )}

              {imagesError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {imagesError}
                </p>
              )}

              <div className="flex justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => void refreshImages()} disabled={isLoadingImages}>
                  {isLoadingImages ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />}
                  Refresh library
                </Button>
              </div>
            </div>

            {isLoadingImages ? (
              <div className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
                <Spinner />
                Loading images...
              </div>
            ) : images.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {images.map((image) => {
                  const isSelected = selectedLeagueImage === image.url;

                  return (
                    <button
                      key={image.fullPath}
                      type="button"
                      onClick={() => selectLeagueImage(image.url)}
                      className={`group overflow-hidden rounded-2xl border bg-white text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                        isSelected ? "border-slate-900 ring-2 ring-slate-900" : "border-slate-200"
                      }`}
                    >
                      <div className="aspect-4/3 bg-slate-100">
                        <img src={image.url} alt={image.originalName} className="h-full w-full object-cover" loading="lazy" />
                      </div>
                      <div className="flex items-start justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{image.name}</p>
                          <p className="truncate text-xs text-slate-500">{image.originalName}</p>
                        </div>
                        {isSelected ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2 py-1 text-xs font-medium text-white">
                            <Check className="size-3.5" />
                            Selected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 group-hover:bg-slate-200">
                            <ImageUp className="size-3.5" />
                            Choose
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center">
                <ImageUp className="size-10 text-slate-400" />
                <h3 className="mt-3 text-sm font-semibold text-slate-900">No media uploaded yet</h3>
                <p className="mt-1 max-w-md text-sm text-slate-600">
                  Upload an image here, then choose it as the league cover.
                </p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
