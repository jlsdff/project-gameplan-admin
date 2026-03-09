"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { forgotPassword } from "@/lib/user/authentication";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

export default function ForgotPasswordPage() {
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();

		const formData = new FormData(event.currentTarget);
		const email = String(formData.get("email") ?? "").trim();

		setError(null);
		setSuccess(null);
		setSubmitting(true);

		try {
			if (!email) {
				setError("Please enter your email address.");
				return;
			}

			await forgotPassword(email);
			setSuccess("Password reset email sent. Please check your inbox.");
		} catch (err: unknown) {
			const message =
				err instanceof Error
					? err.message
					: "Unable to send reset email. Please try again.";
			setError(message);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
			<div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="mb-6">
					<div className="flex items-center justify-center">
						<Image src="/TPG.svg" alt="Logo" width={100} height={100} />
					</div>
					<h1 className="mt-3 text-center text-2xl font-bold tracking-tight text-slate-900">
						FORGOT PASSWORD
					</h1>
					<p className="mt-1 text-center text-sm text-slate-500">
						Enter your email and we will send you a reset link.
					</p>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4">
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

					{error ? (
						<p className="text-center text-sm text-red-600">{error}</p>
					) : null}

					{success ? (
						<p className="text-center text-sm text-green-700">{success}</p>
					) : null}

					<Button type="submit" className="w-full" disabled={submitting}>
						{submitting ? "Sending..." : "Send reset link"}
					</Button>

					<div className="text-center">
						<Link
							href="/login"
							className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
						>
							Back to login
						</Link>
					</div>
				</form>
			</div>
		</main>
	);
}
