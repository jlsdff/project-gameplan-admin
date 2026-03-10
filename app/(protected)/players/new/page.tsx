"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createPlayer } from "@/lib/players/crud";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

type NewPlayerFormValues = {
  firstname: string;
  lastname: string;
  middlename: string;
  number: string;
};

const INITIAL_FORM_VALUES: NewPlayerFormValues = {
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
    return "You do not have permission to create players.";
  }

  if (message.toLowerCase().includes("network")) {
    return "Network error. Please check your connection and try again.";
  }

  return "Unable to create player right now. Please try again.";
}

export default function NewPlayerPage() {
  const router = useRouter();
  const [formValues, setFormValues] = useState<NewPlayerFormValues>(INITIAL_FORM_VALUES);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitAction, setSubmitAction] = useState<"redirect" | "stay">("redirect");

  function handleFieldChange(field: keyof NewPlayerFormValues, value: string) {
    const nextValue = field === "number" ? value.replace(/\D/g, "") : value;

    setFormValues((current) => ({
      ...current,
      [field]: nextValue,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const firstname = formValues.firstname.trim();
    const lastname = formValues.lastname.trim();
    const middlename = formValues.middlename.trim();
    const numberRaw = formValues.number.trim();

    if (!firstname || !lastname) {
      setError("First name and last name are required.");
      setSubmitting(false);
      return;
    }

    try {
      await createPlayer({
        firstname,
        lastname,
        middlename: middlename || null,
        number: numberRaw || null,
      });

      if (submitAction === "stay") {
        setFormValues(INITIAL_FORM_VALUES);
        toast.success("Player created.");
        return;
      }

      toast.success("Player created. Redirecting to players...");
      router.push("/players");
    } catch (submitError: unknown) {
      const friendlyError = getFriendlyErrorMessage(submitError);
      setError(friendlyError);
      toast.error(friendlyError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <section className="mx-auto max-w-2xl space-y-4">
        <header>
          <h1 className="text-2xl font-semibold text-slate-900">New Player</h1>
          <p className="text-sm text-slate-600">Create a player record.</p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
        >
          <Field>
            <FieldLabel htmlFor="firstname">First Name</FieldLabel>
            <Input
              id="firstname"
              name="firstname"
              value={formValues.firstname}
              onChange={(event) => handleFieldChange("firstname", event.target.value)}
              placeholder="John"
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="lastname">Last Name</FieldLabel>
            <Input
              id="lastname"
              name="lastname"
              value={formValues.lastname}
              onChange={(event) => handleFieldChange("lastname", event.target.value)}
              placeholder="Doe"
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="middlename">Middle Name</FieldLabel>
            <Input
              id="middlename"
              name="middlename"
              value={formValues.middlename}
              onChange={(event) => handleFieldChange("middlename", event.target.value)}
              placeholder="Optional"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="number">Player Number</FieldLabel>
            <Input
              id="number"
              name="number"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={formValues.number}
              onChange={(event) => handleFieldChange("number", event.target.value)}
              placeholder="Optional"
            />
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/players")}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="outline"
              disabled={submitting}
              onClick={() => setSubmitAction("stay")}
            >
              {submitting && submitAction === "stay" ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="size-4" />
                  Creating...
                </span>
              ) : (
                "Create & Add Another"
              )}
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              onClick={() => setSubmitAction("redirect")}
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="size-4" />
                  Creating...
                </span>
              ) : (
                "Create Player"
              )}
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}
