import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
	useBlocker,
	useFetcher,
	useLocation,
	useMatches,
	useNavigate,
	useRouteLoaderData,
} from "react-router";

import {
	ACCOUNT_MENU_BUTTON_LABEL,
	ACCOUNT_SETTINGS_PATH,
	DISPLAY_NAME_MAX_LENGTH,
	formatSignInTimestamp,
	isAccountSettingsLocation,
} from "@/lib/account-settings";
import { type AccountLoaderData } from "@/lib/api";
import { oauthResultMessage, redirectToGoogleAuthorization } from "@/lib/google-auth";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	FormControl,
	FormField,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type {
	AccountSettingsActionData,
	AccountSettingsLoaderData,
} from "@/routes/account-settings-data";

export function AccountSettingsFallbackRoute() {
	return <div className="h-full bg-bg" />;
}

export function AccountSettingsDialog() {
	const { user } = useRouteLoaderData("app") as AccountLoaderData;
	const navigate = useNavigate();
	const location = useLocation();
	const matches = useMatches();
	const settingsMatch = matches.find((match) => match.id === "account-settings");
	const routeData = settingsMatch?.data as AccountSettingsLoaderData | undefined;
	const fetcher = useFetcher<AccountSettingsActionData>();
	const methodsFetcher = useFetcher<AccountSettingsLoaderData>();
	const savedDisplayName = user.userDisplayName ?? "";
	const [displayName, setDisplayName] = useState(savedDisplayName);
	const [savedSnapshot, setSavedSnapshot] = useState(savedDisplayName);
	if (savedSnapshot !== savedDisplayName) {
		setSavedSnapshot(savedDisplayName);
		setDisplayName(savedDisplayName);
	}
	const isDirty = displayName !== savedDisplayName;
	const [confirmClose, setConfirmClose] = useState(false);
	const [pendingDirtyProceed, setPendingDirtyProceed] = useState<(() => void) | null>(null);
	const isSaving = fetcher.state !== "idle";
	const fieldErrors = fetcher.data?.ok === false ? fetcher.data.fieldErrors : undefined;
	const loaderData = routeData ?? methodsFetcher.data;
	const [methodsRequested, setMethodsRequested] = useState(false);

	useEffect(() => {
		if (routeData) return;
		setMethodsRequested(true);
		void methodsFetcher.load(ACCOUNT_SETTINGS_PATH);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- load once per open
	}, [routeData]);

	const closeSettings = () => {
		if (location.pathname === ACCOUNT_SETTINGS_PATH) {
			void navigate("/", { replace: true });
			return;
		}

		void navigate(
			{
				pathname: location.pathname,
				search: location.search,
				hash: location.hash,
			},
			{ replace: true },
		);
	};

	const blocker = useBlocker(({ nextLocation }) => {
		const leavingWithDirtyProfile =
			isDirty && !isAccountSettingsLocation(nextLocation);
		return leavingWithDirtyProfile;
	});
	const showDiscardConfirm = confirmClose || blocker.state === "blocked";

	const keepEditing = () => {
		setConfirmClose(false);
		setPendingDirtyProceed(null);
		if (blocker.state === "blocked") {
			blocker.reset();
		}
	};

	const discardChanges = () => {
		setConfirmClose(false);
		setDisplayName(savedDisplayName);
		const proceed = pendingDirtyProceed;
		setPendingDirtyProceed(null);
		if (blocker.state === "blocked") {
			blocker.proceed();
			return;
		}
		if (proceed) {
			proceed();
			return;
		}

		closeSettings();
	};

	const confirmIfProfileDirty = (proceed: () => void) => {
		if (!isDirty) {
			proceed();
			return;
		}

		setPendingDirtyProceed(() => proceed);
		setConfirmClose(true);
	};

	const requestClose = () => {
		if (isDirty) {
			setConfirmClose(true);
			return;
		}

		closeSettings();
	};

	return (
		<>
			<Dialog
				open
				onOpenChange={(open) => {
					if (!open) requestClose();
				}}
			>
				<DialogContent
					showCloseButton={false}
					className="flex max-h-[95dvh] min-h-0 w-[calc(100%-2rem)] max-w-lg flex-col gap-0 overflow-y-auto p-6"
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						const accountMenuButton = document.querySelector<HTMLButtonElement>(
							`[aria-label="${ACCOUNT_MENU_BUTTON_LABEL}"]`,
						);
						accountMenuButton?.focus();
					}}
				>
					<DialogClose className="absolute top-4 right-4 rounded-lg p-1 opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none">
						<X className="size-4" />
						<span className="sr-only">Close</span>
					</DialogClose>
					<DialogHeader>
						<DialogTitle>Account Settings</DialogTitle>
						<DialogDescription>
							Edit your display name and review how you sign in. Primary Email stays read-only.
						</DialogDescription>
					</DialogHeader>

					<section className="mt-6 grid gap-4" aria-labelledby="profile-heading">
						<h2 id="profile-heading" className="font-display text-base font-semibold">
							Profile
						</h2>
						<fetcher.Form method="post" action={ACCOUNT_SETTINGS_PATH} className="grid gap-4">
							<input type="hidden" name="intent" value="profile" />
							<FormField name="displayName">
								<FormLabel htmlFor="display-name">Display name</FormLabel>
								<FormControl asChild>
									<Input
										id="display-name"
										name="displayName"
										autoComplete="name"
										maxLength={DISPLAY_NAME_MAX_LENGTH}
										value={displayName}
										onChange={(event) => setDisplayName(event.target.value)}
										aria-invalid={Boolean(fieldErrors?.displayName)}
										disabled={isSaving}
									/>
								</FormControl>
								{fieldErrors?.displayName ? (
									<FormMessage>{fieldErrors.displayName}</FormMessage>
								) : null}
							</FormField>

							<FormField name="primaryEmail">
								<FormLabel htmlFor="primary-email">Primary Email</FormLabel>
								<FormControl asChild>
									<Input
										id="primary-email"
										value={user.userEmail}
										readOnly
										aria-readonly="true"
									/>
								</FormControl>
							</FormField>

							{fetcher.data?.ok === false && fetcher.data.formError ? (
								<p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
									{fetcher.data.formError}
								</p>
							) : null}

							<div>
								<Button type="submit" disabled={isSaving || !isDirty}>
									Save
								</Button>
							</div>
						</fetcher.Form>
					</section>

					<SignInMethodsSection
						primaryEmail={user.userEmail}
						loaderData={loaderData}
						methodsRequested={methodsRequested}
						methodsLoadIdle={methodsFetcher.state === "idle"}
						confirmIfProfileDirty={confirmIfProfileDirty}
					/>
				</DialogContent>
			</Dialog>

			<AlertDialog
				open={showDiscardConfirm}
				onOpenChange={(open) => {
					if (!open) keepEditing();
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Discard unsaved Profile changes?</AlertDialogTitle>
						<AlertDialogDescription>
							Your display name edits will be lost if you leave Account Settings.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={keepEditing}>Keep editing</AlertDialogCancel>
						<AlertDialogAction onClick={discardChanges}>Discard</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

function SignInMethodsSection({
	primaryEmail,
	loaderData,
	methodsRequested,
	methodsLoadIdle,
	confirmIfProfileDirty,
}: {
	primaryEmail: string;
	loaderData: AccountSettingsLoaderData | undefined;
	methodsRequested: boolean;
	methodsLoadIdle: boolean;
	confirmIfProfileDirty: (proceed: () => void) => void;
}) {
	const statusCopy =
		loaderData || !methodsRequested || !methodsLoadIdle
			? "Loading sign-in methods…"
			: "Could not load sign-in methods.";

	return (
		<section className="mt-8 grid gap-4" aria-labelledby="sign-in-methods-heading">
			<h2 id="sign-in-methods-heading" className="font-display text-base font-semibold">
				Sign-in Methods
			</h2>
			{loaderData ? (
				<SignInMethodsContent
					primaryEmail={primaryEmail}
					data={loaderData}
					confirmIfProfileDirty={confirmIfProfileDirty}
				/>
			) : (
				<p role="status" className="text-sm text-medium-gray">
					{statusCopy}
				</p>
			)}
		</section>
	);
}

function SignInMethodsContent({
	primaryEmail,
	data,
	confirmIfProfileDirty,
}: {
	primaryEmail: string;
	data: AccountSettingsLoaderData;
	confirmIfProfileDirty: (proceed: () => void) => void;
}) {
	const { signInMethods, oauthResult, createPasswordReady } = data;
	const providerEmail = signInMethods.google.providerEmail;
	const emailsDiffer =
		signInMethods.google.connected &&
		providerEmail !== null &&
		providerEmail.toLowerCase() !== primaryEmail.toLowerCase();

	return (
		<div className="grid gap-4">
			{oauthResult ? (
				<p
					role="status"
					className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
				>
					{oauthResultMessage(oauthResult)}
				</p>
			) : null}
			<SignInMethodRow title="Password">
				<p className="text-sm text-medium-gray">
					{signInMethods.password.enabled ? "Enabled" : "Not created"}
				</p>
				{signInMethods.password.changedAt ? (
					<p className="text-sm text-medium-gray">
						Changed {formatSignInTimestamp(signInMethods.password.changedAt)}
					</p>
				) : null}
				<div className="mt-3">
					{signInMethods.password.enabled ? (
						<PasswordChangeForm />
					) : createPasswordReady ? (
						<PasswordCreateForm />
					) : (
						<GoogleReauthStartButton
							confirmIfProfileDirty={confirmIfProfileDirty}
							label="Create"
							variant="outline"
						/>
					)}
				</div>
			</SignInMethodRow>
			<SignInMethodRow title="Google">
				<p className="text-sm text-medium-gray">
					{signInMethods.google.connected ? "Connected" : "Not connected"}
				</p>
				{signInMethods.google.connected && providerEmail ? (
					<p className="text-sm">{providerEmail}</p>
				) : null}
				{signInMethods.google.linkedAt ? (
					<p className="text-sm text-medium-gray">
						Linked {formatSignInTimestamp(signInMethods.google.linkedAt)}
					</p>
				) : null}
				{signInMethods.google.lastUsedAt ? (
					<p className="text-sm text-medium-gray">
						Last used {formatSignInTimestamp(signInMethods.google.lastUsedAt)}
					</p>
				) : null}
				{emailsDiffer ? (
					<p className="text-sm text-medium-gray">
						The Google email differs from your Primary Email. Primary Email is unchanged.
					</p>
				) : null}
				<div className="mt-3 flex flex-wrap items-center gap-2">
					{signInMethods.google.connected ? (
						<>
							<GoogleDisconnectControl passwordEnabled={signInMethods.password.enabled} />
							{signInMethods.password.enabled ? null : (
								<>
									<p className="text-sm text-medium-gray">
										Create a password before disconnecting Google.
									</p>
									{createPasswordReady ? null : (
										<GoogleReauthStartButton
											confirmIfProfileDirty={confirmIfProfileDirty}
											label="Create password"
										/>
									)}
								</>
							)}
						</>
					) : (
						<GoogleConnectForm confirmIfProfileDirty={confirmIfProfileDirty} />
					)}
				</div>
			</SignInMethodRow>
		</div>
	);
}

function SignInMethodRow({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="rounded-lg border border-light-gray p-4">
			<h3 className="font-medium">{title}</h3>
			<div className="mt-2 grid gap-1">{children}</div>
		</div>
	);
}

function PasswordChangeForm() {
	const fetcher = useFetcher<AccountSettingsActionData>();
	const [expanded, setExpanded] = useState(false);
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [confirmError, setConfirmError] = useState<string | undefined>();
	const submitting = fetcher.state !== "idle";
	const changeResult = fetcher.data?.intent === "change-password" ? fetcher.data : undefined;
	const succeeded = changeResult?.ok === true;

	useEffect(() => {
		if (!succeeded) return;
		setExpanded(false);
		setCurrentPassword("");
		setNewPassword("");
		setConfirmPassword("");
		setConfirmError(undefined);
	}, [succeeded]);

	if (!expanded) {
		return (
			<Button type="button" variant="outline" size="sm" onClick={() => setExpanded(true)}>
				Change
			</Button>
		);
	}

	const currentPasswordError =
		changeResult?.ok === false ? changeResult.fieldErrors?.currentPassword : undefined;
	const newPasswordError =
		changeResult?.ok === false ? changeResult.fieldErrors?.newPassword : undefined;
	const confirmationError =
		confirmError ?? (changeResult?.ok === false ? changeResult.fieldErrors?.confirmPassword : undefined);
	const formError = changeResult?.ok === false ? changeResult.formError : undefined;

	return (
		<fetcher.Form
			method="post"
			action={ACCOUNT_SETTINGS_PATH}
			className="grid w-full gap-3"
			onSubmit={(event) => {
				if (newPassword !== confirmPassword) {
					event.preventDefault();
					setConfirmError("New password and confirmation must match.");
				}
			}}
		>
			<input type="hidden" name="intent" value="change-password" />
			<FormField name="currentPassword">
				<FormLabel htmlFor="change-current-password">Current password</FormLabel>
				<FormControl asChild>
					<Input
						id="change-current-password"
						name="currentPassword"
						type="password"
						autoComplete="current-password"
						value={currentPassword}
						onChange={(event) => setCurrentPassword(event.target.value)}
						aria-invalid={Boolean(currentPasswordError)}
						disabled={submitting}
					/>
				</FormControl>
				{currentPasswordError ? <FormMessage>{currentPasswordError}</FormMessage> : null}
			</FormField>
			<FormField name="newPassword">
				<FormLabel htmlFor="change-new-password">New password</FormLabel>
				<FormControl asChild>
					<Input
						id="change-new-password"
						name="newPassword"
						type="password"
						autoComplete="new-password"
						value={newPassword}
						onChange={(event) => setNewPassword(event.target.value)}
						aria-invalid={Boolean(newPasswordError)}
						disabled={submitting}
					/>
				</FormControl>
				{newPasswordError ? <FormMessage>{newPasswordError}</FormMessage> : null}
			</FormField>
			<FormField name="confirmPassword">
				<FormLabel htmlFor="change-confirm-password">Confirm new password</FormLabel>
				<FormControl asChild>
					<Input
						id="change-confirm-password"
						name="confirmPassword"
						type="password"
						autoComplete="new-password"
						value={confirmPassword}
						onChange={(event) => {
							setConfirmPassword(event.target.value);
							setConfirmError(undefined);
						}}
						aria-invalid={Boolean(confirmationError)}
						disabled={submitting}
					/>
				</FormControl>
				{confirmationError ? <FormMessage>{confirmationError}</FormMessage> : null}
			</FormField>
			{formError ? (
				<p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{formError}
				</p>
			) : null}
			<div>
				<Button type="submit" size="sm" disabled={submitting}>
					Save password
				</Button>
			</div>
		</fetcher.Form>
	);
}

function PasswordCreateForm() {
	const fetcher = useFetcher<AccountSettingsActionData>();
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [confirmError, setConfirmError] = useState<string | undefined>();
	const submitting = fetcher.state !== "idle";
	const createResult = fetcher.data?.intent === "create-password" ? fetcher.data : undefined;
	const newPasswordError =
		createResult?.ok === false ? createResult.fieldErrors?.newPassword : undefined;
	const confirmationError =
		confirmError ?? (createResult?.ok === false ? createResult.fieldErrors?.confirmPassword : undefined);
	const formError = createResult?.ok === false ? createResult.formError : undefined;

	return (
		<fetcher.Form
			method="post"
			action={ACCOUNT_SETTINGS_PATH}
			className="grid w-full gap-3"
			onSubmit={(event) => {
				if (newPassword !== confirmPassword) {
					event.preventDefault();
					setConfirmError("New password and confirmation must match.");
				}
			}}
		>
			<input type="hidden" name="intent" value="create-password" />
			<FormField name="newPassword">
				<FormLabel htmlFor="create-new-password">New password</FormLabel>
				<FormControl asChild>
					<Input
						id="create-new-password"
						name="newPassword"
						type="password"
						autoComplete="new-password"
						value={newPassword}
						onChange={(event) => setNewPassword(event.target.value)}
						aria-invalid={Boolean(newPasswordError)}
						disabled={submitting}
					/>
				</FormControl>
				{newPasswordError ? <FormMessage>{newPasswordError}</FormMessage> : null}
			</FormField>
			<FormField name="confirmPassword">
				<FormLabel htmlFor="create-confirm-password">Confirm new password</FormLabel>
				<FormControl asChild>
					<Input
						id="create-confirm-password"
						name="confirmPassword"
						type="password"
						autoComplete="new-password"
						value={confirmPassword}
						onChange={(event) => {
							setConfirmPassword(event.target.value);
							setConfirmError(undefined);
						}}
						aria-invalid={Boolean(confirmationError)}
						disabled={submitting}
					/>
				</FormControl>
				{confirmationError ? <FormMessage>{confirmationError}</FormMessage> : null}
			</FormField>
			{formError ? (
				<p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{formError}
				</p>
			) : null}
			<div>
				<Button type="submit" size="sm" disabled={submitting}>
					Save password
				</Button>
			</div>
		</fetcher.Form>
	);
}

function GoogleReauthStartButton({
	confirmIfProfileDirty,
	label,
	variant = "default",
}: {
	confirmIfProfileDirty: (proceed: () => void) => void;
	label: string;
	variant?: "default" | "outline";
}) {
	const fetcher = useFetcher<AccountSettingsActionData>();
	const redirectedRef = useRef<AccountSettingsActionData | null>(null);
	const submitting = fetcher.state !== "idle";
	const reauthResult = fetcher.data?.intent === "google-reauth" ? fetcher.data : undefined;
	const error = reauthResult?.ok === false ? reauthResult.formError : undefined;

	useEffect(() => {
		if (fetcher.state !== "idle") return;
		const data = fetcher.data;
		if (!data?.ok || data.intent !== "google-reauth" || !data.googleAuthorizationHref) return;
		if (redirectedRef.current === data) return;
		redirectedRef.current = data;
		redirectToGoogleAuthorization(data.googleAuthorizationHref);
	}, [fetcher.state, fetcher.data]);

	return (
		<div className="grid gap-2">
			<fetcher.Form
				method="post"
				action={ACCOUNT_SETTINGS_PATH}
				onSubmit={(event) => {
					event.preventDefault();
					const form = event.currentTarget;
					confirmIfProfileDirty(() => {
						void fetcher.submit(form, {
							method: "post",
							action: ACCOUNT_SETTINGS_PATH,
						});
					});
				}}
			>
				<input type="hidden" name="intent" value="google-reauth" />
				<Button type="submit" variant={variant} size="sm" disabled={submitting}>
					{label}
				</Button>
			</fetcher.Form>
			{error ? (
				<p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{error}
				</p>
			) : null}
		</div>
	);
}

function GoogleDisconnectControl({ passwordEnabled }: { passwordEnabled: boolean }) {
	const fetcher = useFetcher<AccountSettingsActionData>();
	const [open, setOpen] = useState(false);
	const [currentPassword, setCurrentPassword] = useState("");
	const submitting = fetcher.state !== "idle";
	const disconnectResult = fetcher.data?.intent === "google-disconnect" ? fetcher.data : undefined;
	const succeeded = disconnectResult?.ok === true;
	const currentPasswordError =
		disconnectResult?.ok === false ? disconnectResult.fieldErrors?.currentPassword : undefined;
	const formError = disconnectResult?.ok === false ? disconnectResult.formError : undefined;

	useEffect(() => {
		if (!succeeded) return;
		setOpen(false);
		setCurrentPassword("");
	}, [succeeded]);

	if (!passwordEnabled) {
		return (
			<Button type="button" variant="outline" size="sm" disabled>
				Disconnect
			</Button>
		);
	}

	return (
		<>
			<Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
				Disconnect
			</Button>
			<AlertDialog
				open={open}
				onOpenChange={(nextOpen) => {
					if (submitting) return;
					setOpen(nextOpen);
					if (!nextOpen) {
						setCurrentPassword("");
					}
				}}
			>
				<AlertDialogContent>
					<fetcher.Form method="post" action={ACCOUNT_SETTINGS_PATH} className="grid gap-4">
						<input type="hidden" name="intent" value="google-disconnect" />
						<AlertDialogHeader>
							<AlertDialogTitle>Disconnect Google?</AlertDialogTitle>
							<AlertDialogDescription>
								Google will no longer be a sign-in method. You can connect it again later.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<FormField name="currentPassword">
							<FormLabel htmlFor="google-disconnect-current-password">Current password</FormLabel>
							<FormControl asChild>
								<Input
									id="google-disconnect-current-password"
									name="currentPassword"
									type="password"
									autoComplete="current-password"
									value={currentPassword}
									onChange={(event) => setCurrentPassword(event.target.value)}
									aria-invalid={Boolean(currentPasswordError)}
									disabled={submitting}
								/>
							</FormControl>
							{currentPasswordError ? <FormMessage>{currentPasswordError}</FormMessage> : null}
						</FormField>
						{formError ? (
							<p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
								{formError}
							</p>
						) : null}
						<AlertDialogFooter>
							<AlertDialogCancel type="button" disabled={submitting} asChild>
								<Button type="button" variant="outline" size="sm" disabled={submitting}>
									Cancel
								</Button>
							</AlertDialogCancel>
							<Button
								type="submit"
								variant="destructive"
								size="sm"
								disabled={submitting || currentPassword.length === 0}
							>
								Disconnect Google
							</Button>
						</AlertDialogFooter>
					</fetcher.Form>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

function GoogleConnectForm({
	confirmIfProfileDirty,
}: {
	confirmIfProfileDirty: (proceed: () => void) => void;
}) {
	const fetcher = useFetcher<AccountSettingsActionData>();
	const redirectedRef = useRef<AccountSettingsActionData | null>(null);
	const [expanded, setExpanded] = useState(false);
	const [currentPassword, setCurrentPassword] = useState("");
	const submitting = fetcher.state !== "idle";
	const linkResult = fetcher.data?.intent === "google-link" ? fetcher.data : undefined;
	const error =
		linkResult?.ok === false
			? (linkResult.fieldErrors?.currentPassword ?? linkResult.formError)
			: undefined;

	useEffect(() => {
		if (fetcher.state !== "idle") return;
		const data = fetcher.data;
		if (!data?.ok || data.intent !== "google-link" || !data.googleAuthorizationHref) return;
		if (redirectedRef.current === data) return;
		redirectedRef.current = data;
		redirectToGoogleAuthorization(data.googleAuthorizationHref);
	}, [fetcher.state, fetcher.data]);

	const expandConnect = () => {
		confirmIfProfileDirty(() => setExpanded(true));
	};

	if (!expanded) {
		return (
			<Button type="button" variant="outline" size="sm" onClick={expandConnect}>
				Connect
			</Button>
		);
	}

	return (
		<fetcher.Form
			method="post"
			action={ACCOUNT_SETTINGS_PATH}
			className="grid w-full gap-3"
			onSubmit={(event) => {
				event.preventDefault();
				const form = event.currentTarget;
				confirmIfProfileDirty(() => {
					void fetcher.submit(form, {
						method: "post",
						action: ACCOUNT_SETTINGS_PATH,
					});
				});
			}}
		>
			<input type="hidden" name="intent" value="google-link" />
			<FormField name="currentPassword">
				<FormLabel htmlFor="google-link-current-password">Current password</FormLabel>
				<FormControl asChild>
					<Input
						id="google-link-current-password"
						name="currentPassword"
						type="password"
						autoComplete="current-password"
						value={currentPassword}
						onChange={(event) => setCurrentPassword(event.target.value)}
						aria-invalid={Boolean(error)}
						disabled={submitting}
					/>
				</FormControl>
				{error ? <FormMessage>{error}</FormMessage> : null}
			</FormField>
			<div>
				<Button type="submit" size="sm" disabled={submitting || currentPassword.length === 0}>
					Continue to Google
				</Button>
			</div>
		</fetcher.Form>
	);
}
