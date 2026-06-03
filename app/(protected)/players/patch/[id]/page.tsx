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
import { Spinner } from "@/components/ui/spinner";
import { WholePageLoading } from "@/components/ui/wholepage-loading";
import { getPlayer, updatePlayer } from "@/lib/players/crud";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const playerFormSchema = z.object({
  firstname: z.string().trim().min(1, "First name is required."),
  lastname: z.string().trim().min(1, "Last name is required."),
  middlename: z.string(),
  number: z
    .string()
    .regex(/^\d*$/, "Player number must contain only digits."),
});

type PlayerFormValues = z.infer<typeof playerFormSchema>;

const INITIAL_FORM_VALUES: PlayerFormValues = {
  firstname: "",
  lastname: "",
  middlename: "",
  number: "",
};

function getFriendlyErrorMessage(error: unknown): string {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: string }).message)
      : "";

  if (message.toLowerCase().includes("permission")) {
    return "You do not have permission to update players.";
  }

  if (message.toLowerCase().includes("network")) {
    return "Network error. Please check your connection and try again.";
  }

  if (message.toLowerCase().includes("no such player")) {
    return "Player not found.";
  }

  return "Unable to update player right now. Please try again.";
}

export default function PatchPlayerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const playerId = typeof params.id === "string" ? params.id : "";
  const form = useForm<PlayerFormValues>({
    resolver: zodResolver(playerFormSchema),
    defaultValues: INITIAL_FORM_VALUES,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadPlayer() {
      if (!playerId) {
        if (mounted) {
          setLoadError("Player not found.");
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        const player = await getPlayer(playerId);

        if (!mounted) {
          return;
        }

        form.reset({
          firstname: player.firstname ?? "",
          lastname: player.lastname ?? "",
          middlename: player.middlename ?? "",
          number: player.number ?? "",
        });
      } catch (error: unknown) {
        if (!mounted) {
          return;
        }

        setLoadError(getFriendlyErrorMessage(error));
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadPlayer();

    return () => {
      mounted = false;
    };
  }, [form, playerId]);

  async function handleSubmit(values: PlayerFormValues) {
    if (!playerId) {
      setSubmitError("Player not found.");
      return;
    }

    setSubmitError(null);

    const firstname = values.firstname.trim();
    const lastname = values.lastname.trim();
    const middlename = values.middlename.trim();
    const numberRaw = values.number.trim();

    try {
      await updatePlayer(playerId, {
        firstname,
        lastname,
        middlename: middlename || null,
        number: numberRaw || null,
      });

      toast.success("Player updated.");
      router.push("/players");
    } catch (error: unknown) {
      const friendlyError = getFriendlyErrorMessage(error);
      setSubmitError(friendlyError);
      toast.error(friendlyError);
    }
  }

  if (loading) {
    return <WholePageLoading />;
  }

  if (loadError) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 md:p-8">
        <section className="mx-auto max-w-2xl space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <header>
            <h1 className="text-2xl font-semibold text-slate-900">Update Player</h1>
            <p className="text-sm text-slate-600">Unable to load this player.</p>
          </header>
          <p className="text-sm text-red-600">{loadError}</p>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push("/players")}>
              Back to Players
            </Button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <section className="mx-auto max-w-2xl space-y-4">
        <header>
          <h1 className="text-2xl font-semibold text-slate-900">Update Player</h1>
          <p className="text-sm text-slate-600">Edit an existing player record.</p>
        </header>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
          >
            <FormField
              control={form.control}
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
              control={form.control}
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
              control={form.control}
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
              control={form.control}
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
                      onChange={(event) => field.onChange(event.target.value.replace(/\D/g, ""))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {submitError && <p className="text-sm text-red-600">{submitError}</p>}

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/players")}
                disabled={form.formState.isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="size-4" />
                    Saving...
                  </span>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </section>
    </main>
  );
}
