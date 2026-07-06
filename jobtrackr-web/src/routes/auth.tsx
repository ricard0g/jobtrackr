import type React from "react";
import {
	Form as RouterForm,
	Link,
	useActionData,
	useNavigation,
} from "react-router";
import { BriefcaseBusiness, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	FormControl,
	FormField,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { AuthActionData } from "@/types/auth";

function AuthShell({
	children,
	title,
	subtitle,
}: {
	children: React.ReactNode;
	title: string;
	subtitle: string;
}) {
	return (
		<main className="min-h-screen bg-off-white px-4 py-8 text-dark-gray">
			<section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
				<div className="mb-6 flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-md bg-darkest-accent text-white">
						<BriefcaseBusiness size={20} />
					</div>
					<div>
						<h1 className="font-display text-2xl font-bold">JobTrackr</h1>
						<p className="text-sm text-medium-gray">{subtitle}</p>
					</div>
				</div>
				<div className="rounded-lg border border-light-gray bg-white p-6 shadow-cool-light">
					<h2 className="mb-5 font-display text-xl font-bold">{title}</h2>
					{children}
				</div>
			</section>
		</main>
	);
}

export function LoginPage() {
	const actionData = useActionData() as AuthActionData | undefined;
	const navigation = useNavigation();
	const isSubmitting = navigation.state !== "idle";

	return (
		<AuthShell title="Log in" subtitle="Access your application board">
			<RouterForm method="post" className="grid gap-4">
				<FormField name="email">
					<FormLabel>Email</FormLabel>
					<FormControl asChild>
						<Input
							name="email"
							type="email"
							autoComplete="email"
							defaultValue={actionData?.values?.email ?? ""}
							aria-invalid={Boolean(actionData?.fieldErrors?.email)}
							disabled={isSubmitting}
						/>
					</FormControl>
					{actionData?.fieldErrors?.email && (
						<FormMessage>{actionData.fieldErrors.email}</FormMessage>
					)}
				</FormField>

				<FormField name="password">
					<FormLabel>Password</FormLabel>
					<FormControl asChild>
						<Input
							name="password"
							type="password"
							autoComplete="current-password"
							aria-invalid={Boolean(actionData?.fieldErrors?.password)}
							disabled={isSubmitting}
						/>
					</FormControl>
					{actionData?.fieldErrors?.password && (
						<FormMessage>{actionData.fieldErrors.password}</FormMessage>
					)}
				</FormField>

				{actionData?.formError && (
					<p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
						{actionData.formError}
					</p>
				)}

				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting && <Loader2 className="animate-spin" />}
					Log in
				</Button>
			</RouterForm>

			<p className="mt-4 text-sm text-medium-gray">
				New to JobTrackr?{" "}
				<Link className="font-medium text-darkest-accent underline" to="/auth/register">
					Create an account
				</Link>
			</p>
		</AuthShell>
	);
}

export function RegisterPage() {
	const actionData = useActionData() as AuthActionData | undefined;
	const navigation = useNavigation();
	const isSubmitting = navigation.state !== "idle";

	return (
		<AuthShell title="Create account" subtitle="Start tracking your search">
			<RouterForm method="post" className="grid gap-4">
				<FormField name="displayName">
					<FormLabel>Display name</FormLabel>
					<FormControl asChild>
						<Input
							name="displayName"
							autoComplete="name"
							defaultValue={actionData?.values?.displayName ?? ""}
							disabled={isSubmitting}
						/>
					</FormControl>
				</FormField>

				<FormField name="email">
					<FormLabel>Email</FormLabel>
					<FormControl asChild>
						<Input
							name="email"
							type="email"
							autoComplete="email"
							defaultValue={actionData?.values?.email ?? ""}
							aria-invalid={Boolean(actionData?.fieldErrors?.email)}
							disabled={isSubmitting}
						/>
					</FormControl>
					{actionData?.fieldErrors?.email && (
						<FormMessage>{actionData.fieldErrors.email}</FormMessage>
					)}
				</FormField>

				<FormField name="password">
					<FormLabel>Password</FormLabel>
					<FormControl asChild>
						<Input
							name="password"
							type="password"
							autoComplete="new-password"
							aria-invalid={Boolean(actionData?.fieldErrors?.password)}
							disabled={isSubmitting}
						/>
					</FormControl>
					{actionData?.fieldErrors?.password && (
						<FormMessage>{actionData.fieldErrors.password}</FormMessage>
					)}
				</FormField>

				{actionData?.formError && (
					<p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
						{actionData.formError}
					</p>
				)}

				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting && <Loader2 className="animate-spin" />}
					Register
				</Button>
			</RouterForm>

			<p className="mt-4 text-sm text-medium-gray">
				Already have an account?{" "}
				<Link className="font-medium text-darkest-accent underline" to="/auth/login">
					Log in
				</Link>
			</p>
		</AuthShell>
	);
}
