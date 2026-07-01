import { Loader2, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import {
	type FormEvent,
	type ReactNode,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useLoaderData, useRevalidator } from "react-router";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	FormControl,
	FormField,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, type AppLoaderData } from "@/lib/api";
import {
	applicationStatusOptions,
	getApplicationStatusOption,
	type Application,
	type ApplicationPatchRequest,
	type ApplicationStatus,
	type RemoteType,
} from "@/types/application";
import type {
	Interview,
	InterviewCreateRequest,
	InterviewOutcome,
	InterviewType,
} from "@/types/interview";

interface PostulationDetailDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	application: Application | null;
	getNextKanbanOrder: (
		applicationStatus: ApplicationStatus,
		applicationId: number,
	) => number;
	onApplicationUpdated: (application: Application) => void;
	onApplicationDeleted: (applicationId: number) => void;
}

type DrawerMode = "view" | "edit" | "tags";

type InterviewFormValues = {
	interviewType: InterviewType;
	interviewScheduledAt: string;
	interviewLocation: string;
	interviewNotes: string;
};

type ApplicationFormValues = {
	applicationTitle: string;
	applicationStatus: ApplicationStatus;
	applicationSalaryMin: string;
	applicationSalaryMax: string;
	applicationCurrency: string;
	applicationLocation: string;
	applicationRemoteType: RemoteType | "NONE";
	applicationSource: string;
	applicationJobUrl: string;
	applicationAppliedAt: string;
};

type ApplicationFormErrors = Partial<Record<keyof ApplicationFormValues, string>>;

const interviewTypeOptions: Array<{ value: InterviewType; label: string }> = [
	{ value: "PHONE", label: "Phone" },
	{ value: "TECHNICAL", label: "Technical" },
	{ value: "ARCHITECTURE", label: "Architecture" },
	{ value: "HR", label: "HR" },
	{ value: "FINAL", label: "Final" },
	{ value: "OTHER", label: "Other" },
];

const outcomeStyles: Record<
	InterviewOutcome,
	{ label: string; className: string }
> = {
	PENDING: {
		label: "Pending",
		className: "border-yellow-300 bg-yellow-100 text-yellow-800",
	},
	PASSED: {
		label: "Passed",
		className: "border-green-300 bg-green-100 text-green-800",
	},
	FAILED: {
		label: "Failed",
		className: "border-red-300 bg-red-100 text-red-800",
	},
	CANCELLED: {
		label: "Cancelled",
		className: "border-gray-300 bg-gray-100 text-gray-800",
	},
};

const remoteTypeOptions: Array<{ value: RemoteType; label: string }> = [
	{ value: "ON_SITE", label: "On-site" },
	{ value: "HYBRID", label: "Hybrid" },
	{ value: "REMOTE", label: "Remote" },
];

const initialInterviewValues = (): InterviewFormValues => ({
	interviewType: "TECHNICAL",
	interviewScheduledAt: "",
	interviewLocation: "",
	interviewNotes: "",
});

const toInputDate = (date: string | null | undefined) => date?.slice(0, 10) ?? "";

const initialApplicationValues = (
	application: Application | null,
): ApplicationFormValues => ({
	applicationTitle: application?.applicationTitle ?? "",
	applicationStatus: application?.applicationStatus ?? "APPLIED",
	applicationSalaryMin: application?.applicationSalaryMin?.toString() ?? "",
	applicationSalaryMax: application?.applicationSalaryMax?.toString() ?? "",
	applicationCurrency: application?.applicationCurrency ?? "EUR",
	applicationLocation: application?.applicationLocation ?? "",
	applicationRemoteType: application?.applicationRemoteType ?? "NONE",
	applicationSource: application?.applicationSource ?? "",
	applicationJobUrl: application?.applicationJobUrl ?? "",
	applicationAppliedAt: toInputDate(application?.applicationAppliedAt),
});

const toNullableString = (value: string) => {
	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : null;
};

const toNullableNumber = (value: string) => {
	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? Number(trimmedValue) : null;
};

const toOffsetDateTime = (value: string) =>
	value ? new Date(`${value}T00:00:00`).toISOString() : null;

const toOffsetDateTimeFromLocal = (value: string) =>
	value ? new Date(value).toISOString() : "";

const formatDate = (date: string | null | undefined) => {
	if (!date) return "Not specified";
	const parsedDate = new Date(date);
	if (Number.isNaN(parsedDate.getTime())) return "Not specified";

	return new Intl.DateTimeFormat("en-US", {
		dateStyle: "medium",
		timeStyle: date.includes("T") ? "short" : undefined,
	}).format(parsedDate);
};

const formatSalaryValue = (value: number | null | undefined): string | null => {
	if (value === null || value === undefined || !Number.isFinite(value)) {
		return null;
	}

	return `${Math.round(value / 1000)}k`;
};

const formatSalaryRange = (application: Application): string => {
	const currency = application.applicationCurrency ?? "EUR";
	const minValue = formatSalaryValue(application.applicationSalaryMin);
	const maxValue = formatSalaryValue(application.applicationSalaryMax);

	if (minValue && maxValue) return `${currency} ${minValue} - ${maxValue}`;
	if (minValue) return `From ${currency} ${minValue}`;
	if (maxValue) return `Up to ${currency} ${maxValue}`;

	return "Not specified";
};

const getRemoteTypeLabel = (type: RemoteType): string =>
	remoteTypeOptions.find((option) => option.value === type)?.label ?? type;

const getInterviewTypeLabel = (type: InterviewType): string =>
	interviewTypeOptions.find((option) => option.value === type)?.label ?? type;

function DetailBox({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="min-w-0 rounded-md border border-light-gray bg-off-white p-2 text-left">
			<p className="text-xs font-normal text-medium-gray">{label}</p>
			<div className="mt-1 min-w-0 text-sm font-medium text-black">
				{children}
			</div>
		</div>
	);
}

export function PostulationDetailDrawer({
	open,
	onOpenChange,
	application,
	getNextKanbanOrder,
	onApplicationUpdated,
	onApplicationDeleted,
}: PostulationDetailDrawerProps) {
	const { tags: allTags } = useLoaderData() as AppLoaderData;
	const revalidator = useRevalidator();
	const [interviews, setInterviews] = useState<Interview[]>([]);
	const [isLoadingInterviews, setIsLoadingInterviews] = useState(false);
	const [interviewError, setInterviewError] = useState<string | null>(null);
	const [isAddFormOpen, setIsAddFormOpen] = useState(false);
	const [formValues, setFormValues] = useState<InterviewFormValues>(() =>
		initialInterviewValues(),
	);
	const [formError, setFormError] = useState<string | null>(null);
	const [isSubmittingInterview, setIsSubmittingInterview] = useState(false);
	const [deletingInterviewId, setDeletingInterviewId] = useState<number | null>(
		null,
	);
	const [mode, setMode] = useState<DrawerMode>("view");
	const [applicationValues, setApplicationValues] =
		useState<ApplicationFormValues>(() => initialApplicationValues(null));
	const [applicationErrors, setApplicationErrors] =
		useState<ApplicationFormErrors>({});
	const [applicationServerError, setApplicationServerError] = useState<
		string | null
	>(null);
	const [isSubmittingApplication, setIsSubmittingApplication] = useState(false);
	const [isDeletingApplication, setIsDeletingApplication] = useState(false);
	const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(
		() => new Set(),
	);
	const [tagError, setTagError] = useState<string | null>(null);
	const [isSubmittingTags, setIsSubmittingTags] = useState(false);

	const statusDisplay = useMemo(
		() => getApplicationStatusOption(application?.applicationStatus ?? ""),
		[application?.applicationStatus],
	);

	useEffect(() => {
		if (!open || !application) return;

		let isCurrent = true;

		queueMicrotask(() => {
			if (!isCurrent) return;

			setMode("view");
			setApplicationValues(initialApplicationValues(application));
			setApplicationErrors({});
			setApplicationServerError(null);
			setSelectedTagIds(new Set(application.tags.map((tag) => tag.tagId)));
			setTagError(null);
			setIsAddFormOpen(false);
			setFormValues(initialInterviewValues());
			setFormError(null);
			setInterviewError(null);
			setIsLoadingInterviews(true);
		});

		api.getInterviews(application.applicationId)
			.then((data) =>
				isCurrent &&
				setInterviews(
					data.toSorted(
						(a, b) =>
							new Date(a.interviewScheduledAt).getTime() -
							new Date(b.interviewScheduledAt).getTime(),
					),
				),
			)
			.catch((error) => {
				if (!isCurrent) return;

				setInterviewError(
					error instanceof ApiError
						? error.message
						: "Could not load interviews.",
				);
			})
			.finally(() => {
				if (isCurrent) setIsLoadingInterviews(false);
			});

		return () => {
			isCurrent = false;
		};
	}, [open, application]);

	if (!application) return null;

	const updateFormValue = <T extends keyof InterviewFormValues>(
		name: T,
		value: InterviewFormValues[T],
	) => {
		setFormValues((currentValues) => ({
			...currentValues,
			[name]: value,
		}));
		setFormError(null);
	};

	const updateApplicationValue = <T extends keyof ApplicationFormValues>(
		name: T,
		value: ApplicationFormValues[T],
	) => {
		setApplicationValues((currentValues) => ({
			...currentValues,
			[name]: value,
		}));
		setApplicationErrors((currentErrors) => ({
			...currentErrors,
			[name]: undefined,
		}));
		setApplicationServerError(null);
	};

	const buildApplicationPayload = () => {
		const nextErrors: ApplicationFormErrors = {};
		const applicationSalaryMin = toNullableNumber(
			applicationValues.applicationSalaryMin,
		);
		const applicationSalaryMax = toNullableNumber(
			applicationValues.applicationSalaryMax,
		);

		if (!applicationValues.applicationTitle.trim()) {
			nextErrors.applicationTitle = "Enter the job title.";
		}

		if (
			applicationSalaryMin !== null &&
			(!Number.isFinite(applicationSalaryMin) || applicationSalaryMin < 0)
		) {
			nextErrors.applicationSalaryMin = "Must be a number greater than or equal to 0.";
		}

		if (
			applicationSalaryMax !== null &&
			(!Number.isFinite(applicationSalaryMax) || applicationSalaryMax < 0)
		) {
			nextErrors.applicationSalaryMax = "Must be a number greater than or equal to 0.";
		}

		if (
			applicationSalaryMin !== null &&
			applicationSalaryMax !== null &&
			Number.isFinite(applicationSalaryMin) &&
			Number.isFinite(applicationSalaryMax) &&
			applicationSalaryMax < applicationSalaryMin
		) {
			nextErrors.applicationSalaryMax = "Must be greater than the minimum salary.";
		}

		if (
			applicationValues.applicationCurrency.trim() &&
			!/^[A-Z]{3}$/.test(applicationValues.applicationCurrency.trim())
		) {
			nextErrors.applicationCurrency = "Use a 3-letter ISO code.";
		}

		setApplicationErrors(nextErrors);
		if (Object.keys(nextErrors).length > 0) return null;

		const nextOrder =
			applicationValues.applicationStatus === application.applicationStatus
				? application.applicationKanbanOrder
				: getNextKanbanOrder(
						applicationValues.applicationStatus,
						application.applicationId,
					);

		return {
			applicationTitle: applicationValues.applicationTitle.trim(),
			applicationJobUrl: toNullableString(applicationValues.applicationJobUrl),
			applicationLocation: toNullableString(
				applicationValues.applicationLocation,
			),
			applicationRemoteType:
				applicationValues.applicationRemoteType === "NONE"
					? null
					: applicationValues.applicationRemoteType,
			applicationSource: toNullableString(applicationValues.applicationSource),
			applicationSalaryMin,
			applicationSalaryMax,
			applicationCurrency: toNullableString(
				applicationValues.applicationCurrency,
			),
			applicationKanbanOrder: nextOrder,
			applicationAppliedAt: toOffsetDateTime(
				applicationValues.applicationAppliedAt,
			),
		} satisfies ApplicationPatchRequest;
	};

	const handleUpdateApplication = async () => {
		const payload = buildApplicationPayload();
		if (!payload) return;

		setIsSubmittingApplication(true);
		setApplicationServerError(null);

		try {
			const updatedApplication =
				applicationValues.applicationStatus === application.applicationStatus
					? await api.patchApplication(application.applicationId, payload)
					: await api
							.setApplicationStatus(
								application.applicationId,
								applicationValues.applicationStatus,
							)
							.then(() =>
								api.patchApplication(application.applicationId, payload),
							);
			onApplicationUpdated(updatedApplication);
			setMode("view");
			void revalidator.revalidate();
		} catch (error) {
			setApplicationServerError(
				error instanceof ApiError
					? error.message
					: "Could not update the application.",
			);
		} finally {
			setIsSubmittingApplication(false);
		}
	};

	const handleDeleteApplication = async () => {
		const confirmed = window.confirm(
			"Delete this application? This action cannot be undone.",
		);
		if (!confirmed) return;

		setIsDeletingApplication(true);
		setApplicationServerError(null);

		try {
			await api.deleteApplication(application.applicationId);
			onApplicationDeleted(application.applicationId);
			void revalidator.revalidate();
		} catch (error) {
			setApplicationServerError(
				error instanceof ApiError
					? error.message
					: "Could not delete the application.",
			);
		} finally {
			setIsDeletingApplication(false);
		}
	};

	const toggleSelectedTag = (tagId: number) => {
		setSelectedTagIds((currentTagIds) => {
			const nextTagIds = new Set(currentTagIds);
			if (nextTagIds.has(tagId)) {
				nextTagIds.delete(tagId);
			} else {
				nextTagIds.add(tagId);
			}
			return nextTagIds;
		});
		setTagError(null);
	};

	const handleUpdateTags = async () => {
		setIsSubmittingTags(true);
		setTagError(null);

		const currentTagIds = new Set(application.tags.map((tag) => tag.tagId));
		const addTagIds = Array.from(selectedTagIds).filter(
			(tagId) => !currentTagIds.has(tagId),
		);
		const removeTagIds = Array.from(currentTagIds).filter(
			(tagId) => !selectedTagIds.has(tagId),
		);

		try {
			const updatedApplication = await api.patchApplication(
				application.applicationId,
				{ addTagIds, removeTagIds },
			);
			onApplicationUpdated(updatedApplication);
			setMode("view");
			void revalidator.revalidate();
		} catch (error) {
			setTagError(
				error instanceof ApiError
					? error.message
					: "Could not update tags.",
			);
		} finally {
			setIsSubmittingTags(false);
		}
	};

	const handleCreateInterview = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (!formValues.interviewScheduledAt) {
			setFormError("Enter the interview date.");
			return;
		}

		const payload: InterviewCreateRequest = {
			interviewType: formValues.interviewType,
			interviewScheduledAt: toOffsetDateTimeFromLocal(
				formValues.interviewScheduledAt,
			),
			interviewLocation: toNullableString(formValues.interviewLocation),
			interviewNotes: toNullableString(formValues.interviewNotes),
		};

		setIsSubmittingInterview(true);
		setFormError(null);

		try {
			const createdInterview = await api.createInterview(
				application.applicationId,
				payload,
			);
			setInterviews((currentInterviews) =>
				[...currentInterviews, createdInterview].toSorted(
					(a, b) =>
						new Date(a.interviewScheduledAt).getTime() -
						new Date(b.interviewScheduledAt).getTime(),
				),
			);
			setFormValues(initialInterviewValues());
			setIsAddFormOpen(false);
		} catch (error) {
			setFormError(
				error instanceof ApiError
					? error.message
					: "Could not create the interview.",
			);
		} finally {
			setIsSubmittingInterview(false);
		}
	};

	const handleDeleteInterview = async (interview: Interview) => {
		const confirmed = window.confirm(
			"Delete this interview? This action cannot be undone.",
		);
		if (!confirmed) return;

		setDeletingInterviewId(interview.interviewId);
		setInterviewError(null);

		try {
			await api.deleteInterview(application.applicationId, interview.interviewId);
			setInterviews((currentInterviews) =>
				currentInterviews.filter(
					(currentInterview) =>
						currentInterview.interviewId !== interview.interviewId,
				),
			);
		} catch (error) {
			setInterviewError(
				error instanceof ApiError
					? error.message
					: "Could not delete the interview.",
			);
		} finally {
			setDeletingInterviewId(null);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0">
						<DialogTitle className="font-display text-2xl">
							{application.applicationTitle}
						</DialogTitle>
						<p className="mt-1 text-sm text-medium-gray">
							{application.company.companyName}
						</p>
					</div>
					<DialogClose asChild>
						<Button type="button" variant="ghost" size="icon" aria-label="Close">
							<X />
						</Button>
					</DialogClose>
				</div>

				{mode === "view" && (
					<div className="grid gap-5">
						<div className="flex flex-wrap gap-2">
							<span
								className="rounded-full border px-3 py-1 text-sm font-medium"
								style={{
									borderColor: statusDisplay.color,
									color: statusDisplay.color,
									backgroundColor: `${statusDisplay.color}1A`,
								}}
							>
								{statusDisplay.label}
							</span>
							{application.tags.map((tag) => {
								const tagColor = tag.tagColor ?? "#666666";

								return (
									<span
										key={tag.tagId}
										className="rounded-full border px-3 py-1 text-sm"
										style={{
											borderColor: tagColor,
											color: tagColor,
											backgroundColor: `${tagColor}1A`,
										}}
									>
										{tag.tagName}
									</span>
								);
							})}
						</div>

						<div className="grid gap-3 sm:grid-cols-2">
							<DetailBox label="Salary">{formatSalaryRange(application)}</DetailBox>
							<DetailBox label="Location">
								{application.applicationLocation ?? "Not specified"}
							</DetailBox>
							<DetailBox label="Work mode">
								{application.applicationRemoteType
									? getRemoteTypeLabel(application.applicationRemoteType)
									: "Not specified"}
							</DetailBox>
							<DetailBox label="Source">
								{application.applicationSource ?? "Not specified"}
							</DetailBox>
							<DetailBox label="Applied date">
								{formatDate(application.applicationAppliedAt)}
							</DetailBox>
							<DetailBox label="URL">
								{application.applicationJobUrl ? (
									<a
										href={application.applicationJobUrl}
										target="_blank"
										rel="noreferrer"
										className="truncate text-darkest-accent underline"
									>
										{application.applicationJobUrl}
									</a>
								) : (
									"Not specified"
								)}
							</DetailBox>
						</div>

						<div className="flex flex-wrap gap-2">
							<Button type="button" onClick={() => setMode("edit")}>
								<Pencil /> Edit
							</Button>
							<Button type="button" variant="secondary" onClick={() => setMode("tags")}>
								<Tags /> Tags
							</Button>
							<Button
								type="button"
								variant="destructive"
								onClick={handleDeleteApplication}
								disabled={isDeletingApplication}
							>
								{isDeletingApplication ? (
									<Loader2 className="animate-spin" />
								) : (
									<Trash2 />
								)}
								Delete
							</Button>
						</div>

						{applicationServerError && (
							<p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
								{applicationServerError}
							</p>
						)}

						<section className="grid gap-3">
							<div className="flex items-center justify-between">
								<h3 className="font-display text-lg font-bold">Interviews</h3>
								<Button
									type="button"
									variant="secondary"
									onClick={() => setIsAddFormOpen((current) => !current)}
								>
									<Plus /> Add
								</Button>
							</div>

							{isAddFormOpen && (
								<form
									className="grid gap-3 rounded-md border border-light-gray bg-off-white p-3"
									onSubmit={handleCreateInterview}
								>
									<div className="grid gap-3 sm:grid-cols-2">
										<FormField name="interviewType">
											<FormLabel>Type</FormLabel>
											<Select
												value={formValues.interviewType}
												onValueChange={(value) =>
													updateFormValue(
														"interviewType",
														value as InterviewType,
													)
												}
												disabled={isSubmittingInterview}
											>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{interviewTypeOptions.map((option) => (
														<SelectItem
															key={option.value}
															value={option.value}
														>
															{option.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</FormField>
										<FormField name="interviewScheduledAt">
											<FormLabel>Date</FormLabel>
											<FormControl asChild>
												<Input
													type="datetime-local"
													value={formValues.interviewScheduledAt}
													onChange={(event) =>
														updateFormValue(
															"interviewScheduledAt",
															event.target.value,
														)
													}
													disabled={isSubmittingInterview}
												/>
											</FormControl>
										</FormField>
									</div>
									<FormField name="interviewLocation">
										<FormLabel>Location</FormLabel>
										<FormControl asChild>
											<Input
												value={formValues.interviewLocation}
												onChange={(event) =>
													updateFormValue(
														"interviewLocation",
														event.target.value,
													)
												}
												disabled={isSubmittingInterview}
												maxLength={255}
											/>
										</FormControl>
									</FormField>
									<FormField name="interviewNotes">
										<FormLabel>Notes</FormLabel>
										<FormControl asChild>
											<Textarea
												value={formValues.interviewNotes}
												onChange={(event) =>
													updateFormValue("interviewNotes", event.target.value)
												}
												disabled={isSubmittingInterview}
											/>
										</FormControl>
									</FormField>
									{formError && <FormMessage>{formError}</FormMessage>}
									<div className="flex justify-end gap-2">
										<Button
											type="button"
											variant="ghost"
											onClick={() => setIsAddFormOpen(false)}
											disabled={isSubmittingInterview}
										>
											Cancel
										</Button>
										<Button type="submit" disabled={isSubmittingInterview}>
											{isSubmittingInterview && (
												<Loader2 className="animate-spin" />
											)}
											Create
										</Button>
									</div>
								</form>
							)}

							{isLoadingInterviews && (
								<p className="text-sm text-medium-gray">Loading interviews...</p>
							)}
							{interviewError && (
								<p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
									{interviewError}
								</p>
							)}
							{!isLoadingInterviews && interviews.length === 0 && (
								<p className="text-sm text-medium-gray">No interviews recorded.</p>
							)}
							<div className="grid gap-2">
								{interviews.map((interview) => {
									const outcome = outcomeStyles[interview.interviewOutcome];

									return (
										<div
											key={interview.interviewId}
											className="flex items-start justify-between gap-3 rounded-md border border-light-gray p-3"
										>
											<div className="min-w-0">
												<p className="font-medium">
													{getInterviewTypeLabel(interview.interviewType)}
												</p>
												<p className="text-sm text-medium-gray">
													{formatDate(interview.interviewScheduledAt)}
												</p>
												{interview.interviewLocation && (
													<p className="text-sm text-medium-gray">
														{interview.interviewLocation}
													</p>
												)}
												{interview.interviewNotes && (
													<p className="mt-1 text-sm">{interview.interviewNotes}</p>
												)}
											</div>
											<div className="flex shrink-0 items-center gap-2">
												<span
													className={`rounded-full border px-2 py-1 text-xs ${outcome.className}`}
												>
													{outcome.label}
												</span>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													onClick={() => void handleDeleteInterview(interview)}
													disabled={deletingInterviewId === interview.interviewId}
													aria-label="Delete interview"
												>
													{deletingInterviewId === interview.interviewId ? (
														<Loader2 className="animate-spin" />
													) : (
														<Trash2 />
													)}
												</Button>
											</div>
										</div>
									);
								})}
							</div>
						</section>
					</div>
				)}

				{mode === "edit" && (
					<div className="grid gap-4">
						<div className="grid gap-4 sm:grid-cols-2">
							<FormField name="applicationStatus">
								<FormLabel>Status</FormLabel>
								<Select
									value={applicationValues.applicationStatus}
									onValueChange={(value) =>
										updateApplicationValue(
											"applicationStatus",
											value as ApplicationStatus,
										)
									}
									disabled={isSubmittingApplication}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{applicationStatusOptions.map((status) => (
											<SelectItem key={status.value} value={status.value}>
												{status.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</FormField>
							<FormField name="applicationAppliedAt">
								<FormLabel>Applied date</FormLabel>
								<FormControl asChild>
									<Input
										type="date"
										value={applicationValues.applicationAppliedAt}
										onChange={(event) =>
											updateApplicationValue(
												"applicationAppliedAt",
												event.target.value,
											)
										}
										disabled={isSubmittingApplication}
									/>
								</FormControl>
							</FormField>
						</div>

						<FormField name="applicationTitle">
							<FormLabel>Job title</FormLabel>
							<FormControl asChild>
								<Input
									value={applicationValues.applicationTitle}
									onChange={(event) =>
										updateApplicationValue(
											"applicationTitle",
											event.target.value,
										)
									}
									aria-invalid={Boolean(applicationErrors.applicationTitle)}
									disabled={isSubmittingApplication}
									maxLength={255}
								/>
							</FormControl>
							{applicationErrors.applicationTitle && (
								<FormMessage>{applicationErrors.applicationTitle}</FormMessage>
							)}
						</FormField>

						<div className="grid gap-4 sm:grid-cols-3">
							<FormField name="applicationSalaryMin">
								<FormLabel>Minimum salary</FormLabel>
								<FormControl asChild>
									<Input
										type="number"
										value={applicationValues.applicationSalaryMin}
										onChange={(event) =>
											updateApplicationValue(
												"applicationSalaryMin",
												event.target.value,
											)
										}
										disabled={isSubmittingApplication}
										min="0"
										step="0.01"
									/>
								</FormControl>
								{applicationErrors.applicationSalaryMin && (
									<FormMessage>
										{applicationErrors.applicationSalaryMin}
									</FormMessage>
								)}
							</FormField>
							<FormField name="applicationSalaryMax">
								<FormLabel>Maximum salary</FormLabel>
								<FormControl asChild>
									<Input
										type="number"
										value={applicationValues.applicationSalaryMax}
										onChange={(event) =>
											updateApplicationValue(
												"applicationSalaryMax",
												event.target.value,
											)
										}
										disabled={isSubmittingApplication}
										min="0"
										step="0.01"
									/>
								</FormControl>
								{applicationErrors.applicationSalaryMax && (
									<FormMessage>
										{applicationErrors.applicationSalaryMax}
									</FormMessage>
								)}
							</FormField>
							<FormField name="applicationCurrency">
								<FormLabel>Currency</FormLabel>
								<FormControl asChild>
									<Input
										value={applicationValues.applicationCurrency}
										onChange={(event) =>
											updateApplicationValue(
												"applicationCurrency",
												event.target.value.toUpperCase(),
											)
										}
										disabled={isSubmittingApplication}
										maxLength={3}
									/>
								</FormControl>
								{applicationErrors.applicationCurrency && (
									<FormMessage>
										{applicationErrors.applicationCurrency}
									</FormMessage>
								)}
							</FormField>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<FormField name="applicationLocation">
								<FormLabel>Location</FormLabel>
								<FormControl asChild>
									<Input
										value={applicationValues.applicationLocation}
										onChange={(event) =>
											updateApplicationValue(
												"applicationLocation",
												event.target.value,
											)
										}
										disabled={isSubmittingApplication}
										maxLength={255}
									/>
								</FormControl>
							</FormField>
							<FormField name="applicationRemoteType">
								<FormLabel>Work mode</FormLabel>
								<Select
									value={applicationValues.applicationRemoteType}
									onValueChange={(value) =>
										updateApplicationValue(
											"applicationRemoteType",
											value as RemoteType | "NONE",
										)
									}
									disabled={isSubmittingApplication}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="NONE">Not specified</SelectItem>
										{remoteTypeOptions.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</FormField>
						</div>

						<FormField name="applicationJobUrl">
							<FormLabel>Job URL</FormLabel>
							<FormControl asChild>
								<Input
									type="url"
									value={applicationValues.applicationJobUrl}
									onChange={(event) =>
										updateApplicationValue(
											"applicationJobUrl",
											event.target.value,
										)
									}
									disabled={isSubmittingApplication}
									maxLength={1024}
								/>
							</FormControl>
						</FormField>

						<FormField name="applicationSource">
							<FormLabel>Source</FormLabel>
							<FormControl asChild>
								<Input
									value={applicationValues.applicationSource}
									onChange={(event) =>
										updateApplicationValue(
											"applicationSource",
											event.target.value,
										)
									}
									disabled={isSubmittingApplication}
									maxLength={255}
								/>
							</FormControl>
						</FormField>

						{applicationServerError && (
							<p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
								{applicationServerError}
							</p>
						)}

						<div className="flex justify-end gap-2">
							<Button
								type="button"
								variant="ghost"
								onClick={() => setMode("view")}
								disabled={isSubmittingApplication}
							>
								Cancel
							</Button>
							<Button
								type="button"
								onClick={handleUpdateApplication}
								disabled={isSubmittingApplication}
							>
								{isSubmittingApplication && (
									<Loader2 className="animate-spin" />
								)}
								Save
							</Button>
						</div>
					</div>
				)}

				{mode === "tags" && (
					<div className="grid gap-4">
						<div className="grid max-h-80 gap-2 overflow-y-auto rounded-md border border-light-gray p-3">
							{allTags.map((tag) => {
								const checkboxId = `tag-${tag.tagId}`;
								const tagColor = tag.tagColor ?? "#666666";

								return (
									<label
										key={tag.tagId}
										htmlFor={checkboxId}
										className="flex cursor-pointer items-center justify-between gap-3 rounded-md p-2 hover:bg-off-white"
									>
										<div className="flex min-w-0 items-center gap-2">
											<Checkbox
												id={checkboxId}
												checked={selectedTagIds.has(tag.tagId)}
												onCheckedChange={() => toggleSelectedTag(tag.tagId)}
												disabled={isSubmittingTags}
											/>
											<Label htmlFor={checkboxId} className="truncate">
												{tag.tagName}
											</Label>
										</div>
										<span
											className="h-4 w-4 shrink-0 rounded-full border"
											style={{
												borderColor: tagColor,
												backgroundColor: tagColor,
											}}
										/>
									</label>
								);
							})}
						</div>

						{tagError && (
							<p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
								{tagError}
							</p>
						)}

						<div className="flex justify-end gap-2">
							<Button
								type="button"
								variant="ghost"
								onClick={() => setMode("view")}
								disabled={isSubmittingTags}
							>
								Cancel
							</Button>
							<Button
								type="button"
								onClick={handleUpdateTags}
								disabled={isSubmittingTags}
							>
								{isSubmittingTags && <Loader2 className="animate-spin" />}
								Save tags
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
