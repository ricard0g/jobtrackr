import { X } from "lucide-react";
import { useState } from "react";
import {
	useBlocker,
	useFetcher,
	useLocation,
	useNavigate,
	useRouteLoaderData,
} from "react-router";

import {
	ACCOUNT_MENU_BUTTON_LABEL,
	ACCOUNT_SETTINGS_PATH,
	DISPLAY_NAME_MAX_LENGTH,
	isAccountSettingsLocation,
} from "@/lib/account-settings";
import type { AccountLoaderData } from "@/lib/api";
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
import type { AccountSettingsActionData } from "@/routes/account-settings-data";

export function AccountSettingsFallbackRoute() {
	return <div className="h-full bg-bg" />;
}

export function AccountSettingsDialog() {
	const { user } = useRouteLoaderData("app") as AccountLoaderData;
	const navigate = useNavigate();
	const location = useLocation();
	const fetcher = useFetcher<AccountSettingsActionData>();
	const savedDisplayName = user.userDisplayName ?? "";
	const [displayName, setDisplayName] = useState(savedDisplayName);
	const [savedSnapshot, setSavedSnapshot] = useState(savedDisplayName);
	if (savedSnapshot !== savedDisplayName) {
		setSavedSnapshot(savedDisplayName);
		setDisplayName(savedDisplayName);
	}
	const isDirty = displayName !== savedDisplayName;
	const [confirmClose, setConfirmClose] = useState(false);
	const isSaving = fetcher.state !== "idle";
	const fieldErrors = fetcher.data?.ok === false ? fetcher.data.fieldErrors : undefined;

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
		if (blocker.state === "blocked") {
			blocker.reset();
		}
	};

	const discardChanges = () => {
		setConfirmClose(false);
		if (blocker.state === "blocked") {
			blocker.proceed();
			return;
		}

		closeSettings();
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
							Edit your display name. Primary Email stays read-only.
						</DialogDescription>
					</DialogHeader>

					<section className="mt-6 grid gap-4" aria-labelledby="profile-heading">
						<h2 id="profile-heading" className="font-display text-base font-semibold">
							Profile
						</h2>
						<fetcher.Form method="post" action={ACCOUNT_SETTINGS_PATH} className="grid gap-4">
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
