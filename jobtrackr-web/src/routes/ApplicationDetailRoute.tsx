import { Loader2, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import {
	type ReactNode,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	isRouteErrorResponse,
	Link,
	useFetcher,
	useLoaderData,
	useNavigate,
	useRouteError,
} from "react-router";

import { useBoard } from "@/components/kanban/useBoard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
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
import { cn } from "@/lib/utils";
import {
	applicationStatusOptions,
	getApplicationStatusOption,
	type Application,
	type ApplicationStatus,
	type RemoteType,
} from "@/types/application";
import type {
	InterviewOutcome,
	InterviewType,
} from "@/types/interview";
import type {
	ApplicationDetailActionData,
	ApplicationDetailLoaderData,
} from "./application-detail-data";

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

const interviewOutcomeOptions = (
	Object.keys(outcomeStyles) as InterviewOutcome[]
).map((value) => ({
	value,
	label: outcomeStyles[value].label,
}));

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
	application: Application,
): ApplicationFormValues => ({
	applicationTitle: application.applicationTitle,
	applicationStatus: application.applicationStatus,
	applicationSalaryMin: application.applicationSalaryMin?.toString() ?? "",
	applicationSalaryMax: application.applicationSalaryMax?.toString() ?? "",
	applicationCurrency: application.applicationCurrency ?? "EUR",
	applicationLocation: application.applicationLocation ?? "",
	applicationRemoteType: application.applicationRemoteType ?? "NONE",
	applicationSource: application.applicationSource ?? "",
	applicationJobUrl: application.applicationJobUrl ?? "",
	applicationAppliedAt: toInputDate(application.applicationAppliedAt),
});

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

const fetcherData = (
	data: unknown,
): ApplicationDetailActionData | undefined =>
	data as ApplicationDetailActionData | undefined;

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

export function ApplicationDetailRoute() {
	const { application, interviews } =
		useLoaderData() as ApplicationDetailLoaderData;
	const {
		getNextKanbanOrder,
		removeApplication,
		tags: allTags,
		upsertApplication,
	} = useBoard();
	const navigate = useNavigate();
	const applicationFetcher = useFetcher();
	const tagFetcher = useFetcher();
	const interviewFetcher = useFetcher();
	const deleteApplicationFetcher = useFetcher();
	const deleteInterviewFetcher = useFetcher();
	const patchInterviewFetcher = useFetcher();
	const [currentApplication, setCurrentApplication] = useState(application);
	const [mode, setMode] = useState<DrawerMode>("view");
	const [isAddFormOpen, setIsAddFormOpen] = useState(false);
	const [formValues, setFormValues] = useState<InterviewFormValues>(() =>
		initialInterviewValues(),
	);
	const [applicationValues, setApplicationValues] =
		useState<ApplicationFormValues>(() => initialApplicationValues(application));
	const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(
		() => new Set(application.tags.map((tag) => tag.tagId)),
	);
	const [deletingInterviewId, setDeletingInterviewId] = useState<number | null>(
		null,
	);
	const [patchingInterviewId, setPatchingInterviewId] = useState<number | null>(
		null,
	);

	const applicationData = fetcherData(applicationFetcher.data);
	const tagData = fetcherData(tagFetcher.data);
	const interviewData = fetcherData(interviewFetcher.data);
	const deleteApplicationData = fetcherData(deleteApplicationFetcher.data);
	const deleteInterviewData = fetcherData(deleteInterviewFetcher.data);
	const patchInterviewData = fetcherData(patchInterviewFetcher.data);
	const isSubmittingApplication = applicationFetcher.state !== "idle";
	const isSubmittingTags = tagFetcher.state !== "idle";
	const isSubmittingInterview = interviewFetcher.state !== "idle";
	const isDeletingApplication = deleteApplicationFetcher.state !== "idle";
	const isDeletingInterview = deleteInterviewFetcher.state !== "idle";
	const isPatchingInterview = patchInterviewFetcher.state !== "idle";
	const applicationFieldErrors =
		applicationData?.ok === false &&
		applicationData.intent === "updateApplication"
			? applicationData.fieldErrors
			: undefined;
	const applicationServerError =
		applicationData?.ok === false &&
		applicationData.intent === "updateApplication"
			? applicationData.formError
			: deleteApplicationData?.ok === false
				? deleteApplicationData.formError
				: undefined;
	const tagError =
		tagData?.ok === false && tagData.intent === "updateTags"
			? tagData.formError
			: undefined;
	const interviewError =
		deleteInterviewData?.ok === false &&
		deleteInterviewData.intent === "deleteInterview"
			? deleteInterviewData.formError
			: patchInterviewData?.ok === false &&
					patchInterviewData.intent === "patchInterviewOutcome"
				? patchInterviewData.formError
				: undefined;
	const formError =
		interviewData?.ok === false && interviewData.intent === "createInterview"
			? interviewData.formError
			: undefined;
	const statusDisplay = useMemo(
		() => getApplicationStatusOption(currentApplication.applicationStatus),
		[currentApplication.applicationStatus],
	);
	const nextApplicationKanbanOrder =
		applicationValues.applicationStatus === currentApplication.applicationStatus
			? currentApplication.applicationKanbanOrder
			: getNextKanbanOrder(
					applicationValues.applicationStatus,
					currentApplication.applicationId,
				);

	useEffect(() => {
		let isCurrent = true;

		queueMicrotask(() => {
			if (!isCurrent) return;
			setCurrentApplication(application);
			setMode("view");
			setIsAddFormOpen(false);
			setFormValues(initialInterviewValues());
			setApplicationValues(initialApplicationValues(application));
			setSelectedTagIds(new Set(application.tags.map((tag) => tag.tagId)));
			setDeletingInterviewId(null);
			setPatchingInterviewId(null);
		});

		return () => {
			isCurrent = false;
		};
	}, [application]);

	useEffect(() => {
		if (applicationData?.ok && applicationData.intent === "updateApplication") {
			upsertApplication(
				applicationData.application,
				applicationData.boardPlacement,
			);
			queueMicrotask(() => {
				setCurrentApplication(applicationData.application);
				setApplicationValues(
					initialApplicationValues(applicationData.application),
				);
				setMode("view");
			});
		}
	}, [applicationData, upsertApplication]);

	useEffect(() => {
		if (tagData?.ok && tagData.intent === "updateTags") {
			upsertApplication(tagData.application, tagData.boardPlacement);
			queueMicrotask(() => {
				setCurrentApplication(tagData.application);
				setSelectedTagIds(
					new Set(tagData.application.tags.map((tag) => tag.tagId)),
				);
				setMode("view");
			});
		}
	}, [tagData, upsertApplication]);

	useEffect(() => {
		if (interviewData?.ok && interviewData.intent === "createInterview") {
			queueMicrotask(() => {
				setFormValues(initialInterviewValues());
				setIsAddFormOpen(false);
			});
		}
	}, [interviewData]);

	useEffect(() => {
		if (
			deleteInterviewData?.ok &&
			deleteInterviewData.intent === "deleteInterview"
		) {
			queueMicrotask(() => {
				setDeletingInterviewId(null);
			});
		}
	}, [deleteInterviewData]);

	useEffect(() => {
		if (
			patchInterviewData?.ok &&
			patchInterviewData.intent === "patchInterviewOutcome"
		) {
			queueMicrotask(() => {
				setPatchingInterviewId(null);
			});
		}
	}, [patchInterviewData]);

	useEffect(() => {
		if (
			deleteApplicationData?.ok &&
			deleteApplicationData.intent === "deleteApplication"
		) {
			removeApplication(deleteApplicationData.applicationId);
			navigate("/", { replace: true });
		}
	}, [deleteApplicationData, navigate, removeApplication]);

	const updateFormValue = <T extends keyof InterviewFormValues>(
		name: T,
		value: InterviewFormValues[T],
	) => {
		setFormValues((currentValues) => ({
			...currentValues,
			[name]: value,
		}));
	};

	const updateApplicationValue = <T extends keyof ApplicationFormValues>(
		name: T,
		value: ApplicationFormValues[T],
	) => {
		setApplicationValues((currentValues) => ({
			...currentValues,
			[name]: value,
		}));
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
	};

	const handleDeleteApplication = () => {
		const confirmed = window.confirm(
			"Delete this application? This action cannot be undone.",
		);
		if (!confirmed) return;

		const formData = new FormData();
		formData.set("intent", "deleteApplication");
		void deleteApplicationFetcher.submit(formData, { method: "post" });
	};

	const handleDeleteInterview = (interviewId: number) => {
		const confirmed = window.confirm(
			"Delete this interview? This action cannot be undone.",
		);
		if (!confirmed) return;

		const formData = new FormData();
		formData.set("intent", "deleteInterview");
		formData.set("interviewId", String(interviewId));
		setDeletingInterviewId(interviewId);
		void deleteInterviewFetcher.submit(formData, { method: "post" });
	};

	const handlePatchInterviewOutcome = (
		interviewId: number,
		currentOutcome: InterviewOutcome,
		nextOutcome: InterviewOutcome,
	) => {
		if (nextOutcome === currentOutcome) return;

		const formData = new FormData();
		formData.set("intent", "patchInterviewOutcome");
		formData.set("interviewId", String(interviewId));
		formData.set("interviewOutcome", nextOutcome);
		setPatchingInterviewId(interviewId);
		void patchInterviewFetcher.submit(formData, { method: "post" });
	};

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) navigate("/", { replace: true });
			}}
		>
			<DialogContent
				className={cn(
					"flex max-h-full min-w-0 max-w-3xl flex-col",
					mode === "tags" ? "overflow-hidden" : "overflow-y-auto",
				)}
			>
				<div className="flex shrink-0 items-start justify-between gap-4">
					<div className="min-w-0">
						<DialogTitle className="font-display text-2xl">
							{currentApplication.applicationTitle}
						</DialogTitle>
						<p className="mt-1 text-sm text-medium-gray">
							{currentApplication.company.companyName}
						</p>
					</div>
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
							{currentApplication.tags.map((tag) => {
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
							<DetailBox label="Salary">
								{formatSalaryRange(currentApplication)}
							</DetailBox>
							<DetailBox label="Location">
								{currentApplication.applicationLocation ?? "Not specified"}
							</DetailBox>
							<DetailBox label="Work mode">
								{currentApplication.applicationRemoteType
									? getRemoteTypeLabel(currentApplication.applicationRemoteType)
									: "Not specified"}
							</DetailBox>
							<DetailBox label="Source">
								{currentApplication.applicationSource ?? "Not specified"}
							</DetailBox>
							<DetailBox label="Applied date">
								{formatDate(currentApplication.applicationAppliedAt)}
							</DetailBox>
							<DetailBox label="URL">
								{currentApplication.applicationJobUrl ? (
									<a
										href={currentApplication.applicationJobUrl}
										target="_blank"
										rel="noreferrer"
										className="block max-w-full truncate text-darkest-accent underline"
									>
										{currentApplication.applicationJobUrl}
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
							<Button
								type="button"
								variant="secondary"
								onClick={() => setMode("tags")}
							>
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
								<interviewFetcher.Form
									method="post"
									className="grid gap-3 rounded-md border border-light-gray bg-off-white p-3"
								>
									<input type="hidden" name="intent" value="createInterview" />
									<input
										type="hidden"
										name="interviewType"
										value={formValues.interviewType}
									/>
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
													name="interviewScheduledAt"
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
												name="interviewLocation"
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
												name="interviewNotes"
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
								</interviewFetcher.Form>
							)}

							{interviewError && (
								<p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
									{interviewError}
								</p>
							)}
							{interviews.length === 0 && (
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
													<p className="mt-1 text-sm">
														{interview.interviewNotes}
													</p>
												)}
											</div>
											<div className="flex shrink-0 items-center gap-2">
												<Select
													value={interview.interviewOutcome}
													onValueChange={(value) =>
														handlePatchInterviewOutcome(
															interview.interviewId,
															interview.interviewOutcome,
															value as InterviewOutcome,
														)
													}
													disabled={
														isPatchingInterview &&
														patchingInterviewId === interview.interviewId
													}
												>
													<SelectTrigger
														className={`h-auto w-auto gap-1 rounded-full border px-2 py-1 text-xs shadow-none focus-visible:ring-2 ${outcome.className} [&_svg]:size-3 [&_svg]:opacity-60`}
													>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{interviewOutcomeOptions.map((option) => (
															<SelectItem
																key={option.value}
																value={option.value}
															>
																{option.label}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													onClick={() => handleDeleteInterview(interview.interviewId)}
													disabled={
														isDeletingInterview &&
														deletingInterviewId === interview.interviewId
													}
													aria-label="Delete interview"
												>
													{isDeletingInterview &&
													deletingInterviewId === interview.interviewId ? (
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
					<applicationFetcher.Form method="post" className="grid min-w-0 gap-4">
						<input type="hidden" name="intent" value="updateApplication" />
						<input
							type="hidden"
							name="applicationStatus"
							value={applicationValues.applicationStatus}
						/>
						<input
							type="hidden"
							name="applicationRemoteType"
							value={applicationValues.applicationRemoteType}
						/>
						<input
							type="hidden"
							name="previousStatus"
							value={currentApplication.applicationStatus}
						/>
						<input
							type="hidden"
							name="applicationKanbanOrder"
							value={nextApplicationKanbanOrder}
						/>
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
								{applicationFieldErrors?.applicationStatus && (
									<FormMessage>
										{applicationFieldErrors.applicationStatus}
									</FormMessage>
								)}
							</FormField>
							<FormField name="applicationAppliedAt">
								<FormLabel>Applied date</FormLabel>
								<FormControl asChild>
									<Input
										name="applicationAppliedAt"
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
								{applicationFieldErrors?.applicationAppliedAt && (
									<FormMessage>
										{applicationFieldErrors.applicationAppliedAt}
									</FormMessage>
								)}
							</FormField>
						</div>

						<FormField name="applicationTitle">
							<FormLabel>Job title</FormLabel>
							<FormControl asChild>
								<Input
									name="applicationTitle"
									value={applicationValues.applicationTitle}
									onChange={(event) =>
										updateApplicationValue(
											"applicationTitle",
											event.target.value,
										)
									}
									aria-invalid={Boolean(
										applicationFieldErrors?.applicationTitle,
									)}
									disabled={isSubmittingApplication}
									maxLength={255}
								/>
							</FormControl>
							{applicationFieldErrors?.applicationTitle && (
								<FormMessage>
									{applicationFieldErrors.applicationTitle}
								</FormMessage>
							)}
						</FormField>

						<div className="grid gap-4 sm:grid-cols-3">
							<FormField name="applicationSalaryMin">
								<FormLabel>Minimum salary</FormLabel>
								<FormControl asChild>
									<Input
										name="applicationSalaryMin"
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
								{applicationFieldErrors?.applicationSalaryMin && (
									<FormMessage>
										{applicationFieldErrors.applicationSalaryMin}
									</FormMessage>
								)}
							</FormField>
							<FormField name="applicationSalaryMax">
								<FormLabel>Maximum salary</FormLabel>
								<FormControl asChild>
									<Input
										name="applicationSalaryMax"
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
								{applicationFieldErrors?.applicationSalaryMax && (
									<FormMessage>
										{applicationFieldErrors.applicationSalaryMax}
									</FormMessage>
								)}
							</FormField>
							<FormField name="applicationCurrency">
								<FormLabel>Currency</FormLabel>
								<FormControl asChild>
									<Input
										name="applicationCurrency"
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
								{applicationFieldErrors?.applicationCurrency && (
									<FormMessage>
										{applicationFieldErrors.applicationCurrency}
									</FormMessage>
								)}
							</FormField>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<FormField name="applicationLocation">
								<FormLabel>Location</FormLabel>
								<FormControl asChild>
									<Input
										name="applicationLocation"
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

						<FormField className="min-w-0" name="applicationJobUrl">
							<FormLabel>Job URL</FormLabel>
							<FormControl asChild>
								<Input
									name="applicationJobUrl"
									type="url"
									className="max-w-full"
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
									name="applicationSource"
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
							<Button type="submit" disabled={isSubmittingApplication}>
								{isSubmittingApplication && (
									<Loader2 className="animate-spin" />
								)}
								Save
							</Button>
						</div>
					</applicationFetcher.Form>
				)}

				{mode === "tags" && (
					<tagFetcher.Form
						method="post"
						className="grid min-h-0 max-h-full flex-1 grid-rows-[minmax(0,1fr)_auto_auto] gap-4"
					>
						<input type="hidden" name="intent" value="updateTags" />
						{Array.from(selectedTagIds).map((tagId) => (
							<input
								key={tagId}
								type="hidden"
								name="tagIds"
								value={tagId}
							/>
						))}
						<div className="grid max-h-full min-h-0 gap-2 overflow-hidden rounded-md border border-light-gray p-3">
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
							<Button type="submit" disabled={isSubmittingTags}>
								{isSubmittingTags && <Loader2 className="animate-spin" />}
								Save tags
							</Button>
						</div>
					</tagFetcher.Form>
				)}
			</DialogContent>
		</Dialog>
	);
}

export function ApplicationDetailErrorBoundary() {
	const error = useRouteError();
	const status = isRouteErrorResponse(error) ? error.status : 500;
	const message = isRouteErrorResponse(error)
		? error.statusText || error.data
		: error instanceof Error
			? error.message
			: "Unexpected error";
	const title =
		status === 404
			? "Application not found"
			: status === 400
				? "Invalid application"
				: "Could not load application";

	return (
		<Dialog open onOpenChange={() => undefined}>
			<DialogContent className="max-w-md">
				<DialogTitle>{title}</DialogTitle>
				<p className="text-sm text-medium-gray">{message}</p>
				<Button asChild className="justify-self-start">
					<Link to="/" replace>
						Return to board
					</Link>
				</Button>
			</DialogContent>
		</Dialog>
	);
}
