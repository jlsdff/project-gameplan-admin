'use client'
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import { signin } from "@/lib/user/authentication";
import { useState } from "react";
import {useRouter} from "next/navigation";

function getFriendlyErrorMessage(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: string }).code)
      : "";

  switch (code) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password. Please try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    default:
      return "Unable to sign in right now. Please try again.";
  }
}

export default function Login() {

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();   


  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {

    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    setSubmitting(true);
    setError(null);

    try {
      if (!email || !password) {
        setError("Please enter both email and password.");
        return;
      }
      await signin(email, password)
      router.push("/players");
    } catch (err: unknown) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }

  }


  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <div className="flex items-center justify-center">
            <Image
              src="/TPG.svg"
              alt="Logo"
              width={100}
              height={100}
            />
          </div>
          <h1 className="mt-3 text-center text-2xl font-bold tracking-tight text-slate-900">
            ADMIN LOGIN
          </h1>
          <p className="mt-1 text-center text-sm text-slate-500">
            Sign in to continue to the admin dashboard.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" >
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="johndoe@email.com"
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
            />
          </Field>

          {error && (
            <div className="text-sm text-red-600 text-center">{error}</div>
          )}

          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
            >
              Forgot password?
            </Link>
          </div>


          <Button
            type="submit"
            className="w-full"
            disabled={submitting}
          >
            Log in
          </Button>
        </form>
      </div>
    </main>
  );
}
