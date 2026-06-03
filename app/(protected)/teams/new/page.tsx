"use client";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Image as ImageIcon, ImageUp, RefreshCw } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { createPlayer, getAllPlayers, searchPlayers } from "@/lib/players/crud";
import { createTeam, getTeam, updateTeam } from "@/lib/teams/crud";
import { listStoredImages, uploadStoredImage } from "@/lib/storage/images";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const newTeamSchema = z.object({
  teamName: z.string().trim().min(1, "Team name is required."),
  teamAbbr: z.string().trim().min(1, "Team abbreviation is required."),
  teamLogo: z.string(),
  players: z.array(z.string()),
});

type NewTeamFormValues = z.infer<typeof newTeamSchema>;

type PlayerOption = {
  id: string;
  firstname: string;
  lastname: string;
  middlename?: string | null;
  number?: string | null;
};

type StoredImage = {
  fullPath: string;
  name: string;
  url: string;
  originalName: string;
};

const newInlinePlayerSchema = z.object({
  firstname: z.string().trim().min(1, "First name is required."),
  lastname: z.string().trim().min(1, "Last name is required."),
  middlename: z.string(),
  number: z.string().regex(/^\d*$/, "Player number must contain only digits."),
});

type NewInlinePlayerFormValues = z.infer<typeof newInlinePlayerSchema>;

const INITIAL_FORM_VALUES: NewTeamFormValues = {
  teamName: "",
  teamAbbr: "",
  teamLogo: "",
  players: [],
};

function getFriendlyErrorMessage(error: unknown, mode: "create" | "edit"): string {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: string }).message)
      : "";

  if (message.toLowerCase().includes("permission")) {
    return mode === "create"
      ? "You do not have permission to create teams."
      : "You do not have permission to update teams.";
  }

  if (message.toLowerCase().includes("network")) {
    return "Network error. Please check your connection and try again.";
  }

  return mode === "create"
    ? "Unable to create team right now. Please try again."
    : "Unable to update team right now. Please try again.";
}

function getPlayerFriendlyErrorMessage(error: unknown): string {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: string }).message)
      : "";

  if (message.toLowerCase().includes("permission")) {
    return "You do not have permission to create players.";
  }

  if (message.toLowerCase().includes("network")) {
    return "Network error. Please check your connection and try again.";
  }

  return "Unable to create player right now. Please try again.";
}

function getFriendlyImageErrorMessage(error: unknown): string {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: string }).message)
      : "";

  if (message.toLowerCase().includes("permission")) {
    return "You do not have permission to manage team images.";
  }

  if (message.toLowerCase().includes("network")) {
    return "Network error. Please check your connection and try again.";
  }

  return "Unable to load team images right now. Please try again.";
}

export default function NewTeamPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get("teamId");
  const isEditMode = Boolean(teamId);
  const form = useForm<NewTeamFormValues>({
    resolver: zodResolver(newTeamSchema),
    defaultValues: INITIAL_FORM_VALUES,
  });
  const playerForm = useForm<NewInlinePlayerFormValues>({
    resolver: zodResolver(newInlinePlayerSchema),
    defaultValues: {
      firstname: "",
      lastname: "",
      middlename: "",
      number: "",
    },
  });
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [searchResults, setSearchResults] = useState<PlayerOption[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [playerSearchError, setPlayerSearchError] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [isPlayerSheetOpen, setIsPlayerSheetOpen] = useState(false);
  const [images, setImages] = useState<StoredImage[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(true);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageInputKey, setImageInputKey] = useState(0);
  const [isImageSheetOpen, setIsImageSheetOpen] = useState(false);
  const [imagesError, setImagesError] = useState<string | null>(null);
  const [submitAction, setSubmitAction] = useState<"redirect" | "stay">("redirect");
  const [isInitialLoading, setIsInitialLoading] = useState(isEditMode);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);

  const selectedPlayerIds = form.watch("players");
  const selectedTeamLogo = form.watch("teamLogo");

  const selectedPlayers = useMemo(
    () =>
      selectedPlayerIds.map((playerId) => players.find((item) => item.id === playerId) ?? {
        id: playerId,
        firstname: "",
        lastname: playerId,
      }),
    [players, selectedPlayerIds],
  );

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
    if (!teamId) {
      setIsInitialLoading(false);
      return;
    }

    let cancelled = false;

    const loadTeam = async () => {
      setIsInitialLoading(true);
      setInitialLoadError(null);

      try {
        const [team, allPlayers] = await Promise.all([getTeam(teamId), getAllPlayers()]);

        if (cancelled) {
          return;
        }

        const nextPlayers = allPlayers
          .map((player) => ({
            id: player.id,
            firstname: player.firstname ?? "",
            lastname: player.lastname ?? "",
            middlename: player.middlename ?? null,
            number: player.number ?? null,
          }))
          .sort((left, right) => {
            const leftName = `${left.lastname} ${left.firstname}`.toLowerCase();
            const rightName = `${right.lastname} ${right.firstname}`.toLowerCase();
            return leftName.localeCompare(rightName);
          });

        setPlayers(nextPlayers);
        form.reset({
          teamName: team.teamName ?? "",
          teamAbbr: team.teamAbbr ?? "",
          teamLogo: team.teamLogo ?? "",
          players: Array.isArray(team.players) ? team.players : [],
        });
      } catch (loadError) {
        if (!cancelled) {
          const friendlyError = getFriendlyErrorMessage(loadError, "edit");
          setInitialLoadError(friendlyError);
          toast.error(friendlyError);
        }
      } finally {
        if (!cancelled) {
          setIsInitialLoading(false);
        }
      }
    };

    void loadTeam();

    return () => {
      cancelled = true;
    };
  }, [form, teamId]);

  useEffect(() => {
    const search = playerSearch.trim();

    if (!search) {
      setSearchResults([]);
      setPlayersLoading(false);
      setPlayerSearchError(null);
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setPlayersLoading(true);

      try {
        const results = await searchPlayers(search);

        if (cancelled) {
          return;
        }

        const nextResults = results.map((player) => ({
          id: player.id,
          firstname: player.firstname ?? "",
          lastname: player.lastname ?? "",
          middlename: player.middlename ?? null,
          number: player.number ?? null,
        }));

        setSearchResults(nextResults);
        setPlayerSearchError(null);
        setPlayers((current) => {
          const mergedPlayers = new Map(current.map((player) => [player.id, player]));
          nextResults.forEach((player) => {
            mergedPlayers.set(player.id, player);
          });

          return Array.from(mergedPlayers.values()).sort((a, b) => {
            const aName = `${a.lastname} ${a.firstname}`.toLowerCase();
            const bName = `${b.lastname} ${b.firstname}`.toLowerCase();
            return aName.localeCompare(bName);
          });
        });
      } catch {
        if (!cancelled) {
          setPlayerSearchError("Unable to search players right now. Please try again.");
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setPlayersLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [playerSearch]);

  function handleAddPlayer(playerId: string) {
    const currentPlayers = form.getValues("players");
    if (currentPlayers.includes(playerId)) {
      return;
    }
    form.setValue("players", [...currentPlayers, playerId], { shouldDirty: true });
  }

  function handleRemovePlayer(playerId: string) {
    const currentPlayers = form.getValues("players");
    form.setValue(
      "players",
      currentPlayers.filter((id) => id !== playerId),
      { shouldDirty: true },
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
      form.setValue("teamLogo", uploadedImage.url, { shouldDirty: true, shouldValidate: true });
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

  function selectTeamLogo(imageUrl: string) {
    form.setValue("teamLogo", imageUrl, { shouldDirty: true, shouldValidate: true });
  }

  async function handleCreatePlayer(values: NewInlinePlayerFormValues) {
    setPlayerError(null);

    const firstname = values.firstname.trim();
    const lastname = values.lastname.trim();
    const middlename = values.middlename.trim();
    const number = values.number.trim();

    try {
      const playerId = await createPlayer({
        firstname,
        lastname,
        middlename: middlename || null,
        number: number || null,
      });

      const nextPlayer: PlayerOption = {
        id: playerId,
        firstname,
        lastname,
        middlename: middlename || null,
        number: number || null,
      };

      setPlayers((current) => {
        const nextPlayers = [...current, nextPlayer];
        nextPlayers.sort((a, b) => {
          const aName = `${a.lastname} ${a.firstname}`.toLowerCase();
          const bName = `${b.lastname} ${b.firstname}`.toLowerCase();
          return aName.localeCompare(bName);
        });
        return nextPlayers;
      });
      setSearchResults((current) => {
        if (current.some((player) => player.id === playerId)) {
          return current;
        }

        return [nextPlayer, ...current].sort((a, b) => {
          const aName = `${a.lastname} ${a.firstname}`.toLowerCase();
          const bName = `${b.lastname} ${b.firstname}`.toLowerCase();
          return aName.localeCompare(bName);
        });
      });

      handleAddPlayer(playerId);
      playerForm.reset({
        firstname: "",
        lastname: "",
        middlename: "",
        number: "",
      });
      setIsPlayerSheetOpen(false);
      toast.success("Player created and added to team.");
    } catch (submitError: unknown) {
      const friendlyError = getPlayerFriendlyErrorMessage(submitError);
      setPlayerError(friendlyError);
      toast.error(friendlyError);
    }
  }

  async function handleSubmit(values: NewTeamFormValues, action: "redirect" | "stay") {
    setError(null);

    const teamName = values.teamName.trim();
    const teamAbbr = values.teamAbbr.trim();
    const teamLogo = values.teamLogo.trim();

    try {
      const teamPayload = {
        teamName,
        teamAbbr,
        teamLogo,
        wins: 0,
        losses: 0,
        players: values.players,
      };

      if (isEditMode && teamId) {
        const existingTeam = await getTeam(teamId);

        await updateTeam(teamId, {
          ...existingTeam,
          ...teamPayload,
        });

        toast.success("Team updated.");
        router.push("/teams");
        return;
      }

      await createTeam(teamPayload);

      if (action === "stay") {
        form.reset(INITIAL_FORM_VALUES);
        setPlayerSearch("");
        toast.success("Team created.");
        return;
      }

      toast.success("Team created. Redirecting to teams...");
      router.push("/teams");
    } catch (submitError: unknown) {
      const friendlyError = getFriendlyErrorMessage(submitError, isEditMode ? "edit" : "create");
      setError(friendlyError);
      toast.error(friendlyError);
    }
  }

  if (isInitialLoading) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 md:p-8">
        <section className="mx-auto flex min-h-[50vh] max-w-5xl items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white shadow-sm">
          <Spinner className="size-5" />
          <span className="text-sm text-slate-600">Loading team...</span>
        </section>
      </main>
    );
  }

  if (initialLoadError) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 md:p-8">
        <section className="mx-auto max-w-5xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">{isEditMode ? "Update Team" : "New Team"}</h1>
          <p className="mt-2 text-sm text-red-600">{initialLoadError}</p>
          <div className="mt-6 flex justify-end">
            <Button type="button" variant="outline" onClick={() => router.push("/teams")}>
              Back to Teams
            </Button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <section className="mx-auto max-w-5xl space-y-4">
        <header>
          <h1 className="text-2xl font-semibold text-slate-900">{isEditMode ? "Update Team" : "New Team"}</h1>
          <p className="text-sm text-slate-600">{isEditMode ? "Edit a team record." : "Create a team record."}</p>
        </header>

        <Sheet open={isPlayerSheetOpen} onOpenChange={setIsPlayerSheetOpen}>
          <SheetContent className="w-full sm:max-w-xl">
            <SheetHeader>
              <SheetTitle>Create & Add Player</SheetTitle>
              <SheetDescription>Create a player and add them to this team.</SheetDescription>
            </SheetHeader>

            <div className="px-4 pb-4">
              <Form {...playerForm}>
                <form
                  onSubmit={playerForm.handleSubmit(handleCreatePlayer)}
                  className="space-y-4"
                >
                  <FormField
                    control={playerForm.control}
                    name="firstname"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={playerForm.control}
                    name="lastname"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={playerForm.control}
                    name="middlename"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Middle Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Optional" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={playerForm.control}
                    name="number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Player Number</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="Optional"
                            {...field}
                            onChange={(event) =>
                              field.onChange(event.target.value.replace(/\D/g, ""))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {playerError && <p className="text-sm text-red-600">{playerError}</p>}

                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsPlayerSheetOpen(false)}
                      disabled={playerForm.formState.isSubmitting}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={playerForm.formState.isSubmitting}>
                      {playerForm.formState.isSubmitting ? (
                        <span className="inline-flex items-center gap-2">
                          <Spinner className="size-4" />
                          Creating...
                        </span>
                      ) : (
                        "Create & Add Player"
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          </SheetContent>
        </Sheet>

        <Form {...form}>
          <form
            onSubmit={(event) => {
              const nativeEvent = event.nativeEvent as SubmitEvent;
              const nextAction =
                nativeEvent.submitter?.getAttribute("data-submit-action") === "stay"
                  ? "stay"
                  : "redirect";

              setSubmitAction(nextAction);

              return form.handleSubmit((values) => handleSubmit(values, nextAction))(event);
            }}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
          >
            <FormField
              control={form.control}
              name="teamName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Team Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Sharks" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="teamAbbr"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Team Abbreviation</FormLabel>
                  <FormControl>
                    <Input placeholder="SHK" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="teamLogo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Team Logo</FormLabel>
                  <FormControl>
                    <Input type="hidden" {...field} />
                  </FormControl>
                  <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4">
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
                          {selectedTeamLogo || "No image selected yet."}
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

            <div className="space-y-3 rounded-md border border-slate-200 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900">Players</p>
                <p className="text-xs text-slate-600">Add players to this team.</p>
              </div>

              <div className="flex items-center justify-end">
                <Button type="button" variant="outline" onClick={() => setIsPlayerSheetOpen(true)}>
                  Create & Add Player
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-700">Players</p>
                  <Input
                    value={playerSearch}
                    onChange={(event) => setPlayerSearch(event.target.value)}
                    placeholder="Search players by name"
                  />
                  {playerSearchError && (
                    <p className="text-xs text-red-600">{playerSearchError}</p>
                  )}
                  <div className="min-h-56 max-h-80 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-2">
                    {playersLoading ? (
                      <p className="inline-flex items-center gap-2 text-xs text-slate-600">
                        <Spinner className="size-3" />
                        Searching players...
                      </p>
                    ) : playerSearch.trim().length === 0 ? (
                      <p className="px-1 py-2 text-xs text-slate-500">
                        Type a player name to search.
                      </p>
                    ) : searchResults.length > 0 ? (
                      searchResults.map((player) => {
                        const isSelected = selectedPlayerIds.includes(player.id);
                        const playerLabel = player.number
                          ? `#${player.number} - ${player.lastname}, ${player.firstname}`
                          : `${player.lastname}, ${player.firstname}`;

                        return (
                          <div
                            key={player.id}
                            className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                          >
                            <span className="text-sm text-slate-800">{playerLabel}</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleAddPlayer(player.id)}
                              disabled={isSelected || form.formState.isSubmitting}
                            >
                              {isSelected ? "Added" : "Add"}
                            </Button>
                          </div>
                        );
                      })
                    ) : (
                      <p className="px-1 py-2 text-xs text-slate-500">No players found.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-700">Added Players</p>
                  <div className="min-h-56 max-h-80 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-2">
                    {selectedPlayers.length > 0 ? (
                      selectedPlayers.map((player) => {
                        const label = player.firstname
                          ? `${player.lastname}, ${player.firstname}`
                          : player.lastname;

                        return (
                          <div
                            key={player.id}
                            className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                          >
                            <span className="text-sm text-slate-800">{label}</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleRemovePlayer(player.id)}
                              disabled={form.formState.isSubmitting}
                            >
                              Remove
                            </Button>
                          </div>
                        );
                      })
                    ) : (
                      <p className="px-1 py-2 text-xs text-slate-500">No players selected.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/teams")}
                disabled={form.formState.isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="outline"
                disabled={form.formState.isSubmitting}
                data-submit-action="stay"
              >
                {form.formState.isSubmitting && submitAction === "stay" ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="size-4" />
                          {isEditMode ? "Updating..." : "Creating..."}
                  </span>
                ) : (
                        isEditMode ? "Save & Keep Editing" : "Create & Add Another"
                )}
              </Button>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                data-submit-action="redirect"
              >
                {form.formState.isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="size-4" />
                    {isEditMode ? "Updating..." : "Creating..."}
                  </span>
                ) : (
                    isEditMode ? "Update Team" : "Create Team"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </section>

      <Sheet open={isImageSheetOpen} onOpenChange={setIsImageSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="pr-10">
            <SheetTitle>Team media picker</SheetTitle>
            <SheetDescription>
              Select an uploaded image for the team logo, or upload a new image if the one you want is not here yet.
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
                  const isSelected = selectedTeamLogo === image.url;

                  return (
                    <button
                      key={image.fullPath}
                      type="button"
                      onClick={() => selectTeamLogo(image.url)}
                      className={`group overflow-hidden rounded-2xl border text-left transition ${
                        isSelected
                          ? "border-slate-900 ring-2 ring-slate-900/15"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="relative aspect-4/3 bg-slate-100">
                        <img
                          src={image.url}
                          alt={image.originalName}
                          className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                        />
                        {isSelected && (
                          <div className="absolute left-3 top-3 rounded-full bg-slate-950 px-3 py-1 text-xs font-medium text-white">
                            Selected
                          </div>
                        )}
                      </div>
                      <div className="space-y-1 p-4">
                        <p className="break-all text-sm font-medium text-slate-900">{image.originalName}</p>
                        <p className="break-all text-xs text-slate-500">{image.url}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
                No uploaded images found.
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
