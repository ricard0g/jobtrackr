import type React from "react";
import { useEffect, useRef } from "react";
import {
	Form as RouterForm,
	Link,
	useActionData,
	useLoaderData,
	useLocation,
	useNavigation,
} from "react-router";
import { BriefcaseBusiness, Loader2 } from "lucide-react";

import { ContinueWithGoogleButton } from "@/components/auth/ContinueWithGoogleButton";
import { Button } from "@/components/ui/button";
import {
	FormControl,
	FormField,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { AUTH_BASE_URL } from "@/lib/api-config";
import {
	googleAuthorizationHref,
	oauthResultMessage,
	redirectToGoogleAuthorization,
	sanitizeOauthReturnTo,
} from "@/lib/google-auth";
import type { PublicAuthLoaderData } from "@/routes/auth-data";
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

function GoogleSignInSection({ screen }: { screen: "login" | "register" }) {
	const { google, oauthResult } = useLoaderData() as PublicAuthLoaderData;
	const location = useLocation();
	const banner = oauthResult ? (
		<p
			role="status"
			className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
		>
			{oauthResultMessage(oauthResult)}
		</p>
	) : null;
	if (!google) {
		return banner ? <div className="mb-4">{banner}</div> : null;
	}

	const href = googleAuthorizationHref(
		screen,
		sanitizeOauthReturnTo(new URLSearchParams(location.search).get("returnTo")),
		`${AUTH_BASE_URL}/oauth2/authorization/google`,
	);

	return (
		<div className="mb-4 grid gap-3">
			{banner}
			<ContinueWithGoogleButton href={href} />
			<div className="flex items-center gap-3 text-xs uppercase tracking-wide text-medium-gray">
				<span className="h-px flex-1 bg-light-gray" />
				or
				<span className="h-px flex-1 bg-light-gray" />
			</div>
		</div>
	);
}

export function LoginPage() {
	const actionData = useActionData() as AuthActionData | undefined;
	const navigation = useNavigation();
	const location = useLocation();
	const isSubmitting = navigation.state !== "idle";
	const registerTo = {
		pathname: "/auth/register",
		search: location.search,
	};

	return (
		<AuthShell title="Log in" subtitle="Access your application board">
			<GoogleSignInSection screen="login" />
			<RouterForm method="post" className="grid gap-4">
				<FormField name="email">
					<FormLabel htmlFor="login-email">Email</FormLabel>
					<FormControl asChild>
						<Input
							id="login-email"
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
					<FormLabel htmlFor="login-password">Password</FormLabel>
					<FormControl asChild>
						<Input
							id="login-password"
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
				<Link className="font-medium text-darkest-accent underline" to={registerTo}>
					Create an account
				</Link>
			</p>
		</AuthShell>
	);
}

function OAuthResultBanner({ screen }: { screen: "login" | "register" }) {
	const { oauthResult } = useLoaderData() as PublicAuthLoaderData;
	if (!oauthResult) return null;
	return (
		<p
			role="status"
			className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
		>
			{oauthResultMessage(oauthResult, screen)}
		</p>
	);
}

function GoogleRegistrationForm({ email }: { email: string }) {
	const actionData = useActionData() as AuthActionData | undefined;
	const navigation = useNavigation();
	const redirectedRef = useRef<AuthActionData | null>(null);
	const isSubmitting = navigation.state !== "idle";

	useEffect(() => {
		if (!actionData?.googleAuthorizationHref) return;
		if (redirectedRef.current === actionData) return;
		redirectedRef.current = actionData;
		redirectToGoogleAuthorization(actionData.googleAuthorizationHref);
	}, [actionData]);

	return (
		<RouterForm method="post" className="mb-4 grid gap-3">
			<ContinueWithGoogleButton submitIntent="google" disabled={isSubmitting} />
			{actionData?.formError && !actionData.values && (
				<p role="alert" className="text-sm text-destructive">
					{actionData.formError}
				</p>
			)}
			<p className="text-xs text-medium-gray">
				Choose the Google account whose verified email is {email}.
			</p>
		</RouterForm>
	);
}

export function RegisterPage() {
	const loaderData = useLoaderData() as PublicAuthLoaderData;
	const actionData = useActionData() as AuthActionData | undefined;
	const navigation = useNavigation();
	const location = useLocation();
	const isSubmitting = navigation.state !== "idle";
	const loginTo = {
		pathname: "/auth/login",
		search: location.search,
	};

	return (
		<AuthShell title="Create account" subtitle="Finish your paid registration">
			<p className="mb-4 text-sm text-medium-gray">
				Complete payment first, then open the verification link sent to your
				Checkout Email. Your paid week starts at Stripe billing; registration
				does not restart it.
			</p>
			<OAuthResultBanner screen="register" />
			{loaderData.registrationError && (
				<p role="alert">{loaderData.registrationError}</p>
			)}
			{!loaderData.registration && (
				<a
					className="font-medium text-darkest-accent underline"
					href="https://jobtrakcr.com/#pricing-section"
				>
					View the weekly subscription
				</a>
			)}
			{loaderData.registration && (
				<>
					<p className="mb-4 text-sm text-medium-gray">
						Registering {loaderData.registration.email}. Paid access ends{" "}
						{new Date(loaderData.registration.paidUntil).toLocaleString()}.
					</p>
					{loaderData.google && (
						<GoogleRegistrationForm email={loaderData.registration.email} />
					)}
					{!loaderData.registration.passwordAllowed && (
						<p className="text-sm text-medium-gray">
							Prefer a password? Use Send my registration email on your payment
							confirmation page, then open the link in that email.
						</p>
					)}
					{loaderData.registration.passwordAllowed && (
						<RouterForm method="post" className="grid gap-4">
							<FormField name="displayName">
								<FormLabel htmlFor="register-displayName">
									Display name
								</FormLabel>
								<FormControl asChild>
									<Input
										name="displayName"
										id="register-displayName"
										autoComplete="name"
										defaultValue={actionData?.values?.displayName ?? ""}
										disabled={isSubmitting}
									/>
								</FormControl>
							</FormField>

							<FormField name="email">
								<FormLabel htmlFor="register-email">Email</FormLabel>
								<FormControl asChild>
									<Input
										name="email"
										id="register-email"
										type="email"
										autoComplete="email"
										value={loaderData.registration.email}
										readOnly
										aria-invalid={Boolean(actionData?.fieldErrors?.email)}
										disabled={isSubmitting}
									/>
								</FormControl>
								{actionData?.fieldErrors?.email && (
									<FormMessage>{actionData.fieldErrors.email}</FormMessage>
								)}
							</FormField>

							<FormField name="password">
								<FormLabel htmlFor="register-password">Password</FormLabel>
								<FormControl asChild>
									<Input
										name="password"
										id="register-password"
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
					)}
				</>
			)}

			<p className="mt-4 text-sm text-medium-gray">
				Already have an account?{" "}
				<Link
					className="font-medium text-darkest-accent underline"
					to={loginTo}
				>
					Log in
				</Link>
			</p>
		</AuthShell>
	);
}
