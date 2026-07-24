import { ChevronDown, Download, LoaderCircle, Sparkles, Trash2, XCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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
	getApplicationStatusOption,
	type Application,
} from "@/types/application";
import type { ApplicationCv } from "@/types/application-cv";
import type { BaseCv } from "@/types/base-cv";
import {
	cvGenerationStatusLabels,
	isActiveCvGenerationStatus,
	type AiConsent,
	type CvGeneration,
	type GeneratedCvFormat,
} from "@/types/cv-generation";
import {
	MAX_APPLICATION_CVS,
	type GenerateActionData,
	type GenerateLoaderData,
} from "@/routes/generate-data";
import {
	companyMonogram,
	formatAbsoluteTime,
	formatRelativeTime,
	generationStateLabel,
	humanizeModelId,
	locationRemoteLabel,
	shouldStartExpanded,
} from "@/routes/generate-display";
import {
	buildGenerateSections,
	generatedActivityAt,
	latestGeneration,
	newestGeneratedCv,
	preparingActivityAt,
	type GenerateSectionItem,
} from "@/routes/generate-sections";

const formatLabels = { PDF: "PDF", DOCX: "DOCX", MARKDOWN: "Markdown" } as const;
const POLL_INTERVAL_MS = 3_000;

const formatBytes = (bytes: number) =>
	new Intl.NumberFormat("en", {
		style: "unit",
		unit: bytes >= 1024 * 1024 ? "megabyte" : "kilobyte",
		maximumFractionDigits: 1,
	}).format(bytes / (bytes >= 1024 * 1024 ? 1024 * 1024 : 1024));
const openSignedDownload = (uri: string) => {
	const link = document.createElement("a");
	link.href = uri;
	link.rel = "noopener noreferrer";
	link.target = "_blank";
	link.click();
};

function ApplicationCvRow({ applicationCv }: { applicationCv: ApplicationCv }) {
	const deleteFetcher = useFetcher<GenerateActionData>();
	const downloadFetcher = useFetcher<GenerateActionData>();
	const openedDownloadRef = useRef<GenerateActionData | null>(null);
	const deleting = deleteFetcher.state !== "idle";
	const downloading = downloadFetcher.state !== "idle";

	useEffect(() => {
		if (downloadFetcher.state !== "idle") return;
		const data = downloadFetcher.data;
		if (!data?.ok || data.intent !== "download-cv" || !data.uri) return;
		if (openedDownloadRef.current === data) return;
		openedDownloadRef.current = data;
		openSignedDownload(data.uri);
	}, [downloadFetcher.state, downloadFetcher.data]);

	const confirmDelete = (event: React.FormEvent<HTMLFormElement>) => {
		if (!window.confirm(`Permanently delete ${applicationCv.originalFilename}?`)) {
			event.preventDefault();
		}
	};

	return (
		<li className="flex items-start gap-3 rounded-lg border border-light-gray bg-white px-3 py-2">
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-semibold text-dark-gray">{applicationCv.originalFilename}</p>
				<p className="mt-0.5 text-xs text-medium-gray">
					v{applicationCv.version} · {formatLabels[applicationCv.format]} ·{" "}
					{formatBytes(applicationCv.byteSize)} · {formatAbsoluteTime(applicationCv.createdAt)}
				</p>
			</div>
			<div className="flex gap-1">
				<downloadFetcher.Form method="post" action="/generate">
					<input type="hidden" name="intent" value="download-cv" />
					<input type="hidden" name="applicationCvId" value={applicationCv.applicationCvId} />
					<Button
						type="submit"
						variant="ghost"
						size="sm"
						disabled={downloading}
						aria-label={`Download ${applicationCv.originalFilename}`}
					>
						{downloading ? <LoaderCircle className="animate-spin" /> : <Download />}
					</Button>
				</downloadFetcher.Form>
				<deleteFetcher.Form method="post" action="/generate" onSubmit={confirmDelete}>
					<input type="hidden" name="intent" value="delete-cv" />
					<input type="hidden" name="applicationCvId" value={applicationCv.applicationCvId} />
					<Button
						type="submit"
						variant="ghost"
						size="sm"
						disabled={deleting}
						aria-label={`Delete ${applicationCv.originalFilename}`}
					>
						{deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
					</Button>
				</deleteFetcher.Form>
			</div>
			{downloadFetcher.data?.ok === false ? (
				<p role="alert" className="basis-full text-sm text-red-700">
					{downloadFetcher.data.error}
				</p>
			) : null}
			{deleteFetcher.data?.ok === false ? (
				<p role="alert" className="basis-full text-sm text-red-700">
					{deleteFetcher.data.error}
				</p>
			) : null}
		</li>
	);
}

function GenerateDialog({
	application,
	baseCvs,
	consent,
	open,
	onOpenChange,
	atLimit,
	session,
	initialJobDescription,
}: {
	application: Application;
	baseCvs: BaseCv[];
	consent: AiConsent;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	atLimit: boolean;
	session: number;
	initialJobDescription: string;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{open ? (
				<GenerateDialogForm
					key={session}
					application={application}
					baseCvs={baseCvs}
					consent={consent}
					atLimit={atLimit}
					onOpenChange={onOpenChange}
					initialJobDescription={initialJobDescription}
				/>
			) : null}
		</Dialog>
	);
}

function GenerateDialogForm({
	application,
	baseCvs,
	consent,
	atLimit,
	onOpenChange,
	initialJobDescription,
}: {
	application: Application;
	baseCvs: BaseCv[];
	consent: AiConsent;
	atLimit: boolean;
	onOpenChange: (open: boolean) => void;
	initialJobDescription: string;
}) {
	const createFetcher = useFetcher<GenerateActionData>();
	const formId = useId();
	const [baseCvId, setBaseCvId] = useState(() =>
		baseCvs[0] ? String(baseCvs[0].baseCvId) : "",
	);
	const [format, setFormat] = useState<GeneratedCvFormat>("PDF");
	const [jobDescription, setJobDescription] = useState(initialJobDescription);
	const [additionalInformation, setAdditionalInformation] = useState("");
	const [consentAccepted, setConsentAccepted] = useState(false);
	const [clientError, setClientError] = useState<string | null>(null);
	const submitting = createFetcher.state !== "idle";
	const needsConsent = !consent.current;
	const createSucceeded =
		createFetcher.state === "idle" &&
		createFetcher.data?.ok === true &&
		createFetcher.data.intent === "create";

	useEffect(() => {
		if (!createSucceeded) return;
		onOpenChange(false);
	}, [createSucceeded, onOpenChange]);

	const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		setClientError(null);
		if (!baseCvId) {
			event.preventDefault();
			setClientError("Choose a Base CV.");
			return;
		}
		if (!jobDescription.trim()) {
			event.preventDefault();
			setClientError("A Job Description is required.");
			return;
		}
		if (needsConsent && !consentAccepted) {
			event.preventDefault();
			setClientError(
				"You must consent to sending your Base CV, Job Description, and additional information to Google Gemini.",
			);
			return;
		}
		if (baseCvs.length === 0) {
			event.preventDefault();
			setClientError("Upload a Base CV in Documents before generating.");
			return;
		}
		if (atLimit) {
			event.preventDefault();
			setClientError(
				"This application already has 20 generated CVs. Delete one before generating another.",
			);
		}
	};

	return (
		<DialogContent aria-describedby={`${formId}-description`}>
			<DialogHeader>
				<DialogTitle>Generate CV</DialogTitle>
				<DialogDescription id={`${formId}-description`}>
					Tailor a CV for {application.applicationTitle} at {application.company.companyName}.
				</DialogDescription>
			</DialogHeader>

			<p className="rounded-lg border border-light-gray bg-lightest-accent px-3 py-2 text-sm text-dark-gray">
				Your Base CV, Job Description, and any additional information will be sent to Google Gemini to
				generate a tailored document.
			</p>

			{atLimit ? (
				<p role="alert" className="text-sm text-amber-800">
					This application already has {MAX_APPLICATION_CVS} generated CVs. Delete one before generating
					another.
				</p>
			) : null}

			<createFetcher.Form
				method="post"
				action="/generate"
				className="grid gap-4"
				noValidate
				onSubmit={onSubmit}
			>
				<input type="hidden" name="intent" value="create" />
				<input type="hidden" name="applicationId" value={application.applicationId} />
				<input type="hidden" name="baseCvId" value={baseCvId} />
				<input type="hidden" name="format" value={format} />
				<input
					type="hidden"
					name="consentAccepted"
					value={needsConsent ? String(consentAccepted) : "true"}
				/>

				<div className="grid gap-2">
					<Label htmlFor={`${formId}-base-cv`}>Base CV</Label>
					<Select
						value={baseCvId}
						onValueChange={setBaseCvId}
						disabled={submitting || baseCvs.length === 0}
					>
						<SelectTrigger id={`${formId}-base-cv`} aria-label="Base CV">
							<SelectValue placeholder="Select a Base CV" />
						</SelectTrigger>
						<SelectContent>
							{baseCvs.map((baseCv) => (
								<SelectItem key={baseCv.baseCvId} value={String(baseCv.baseCvId)}>
									{baseCv.originalFilename}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{createFetcher.data?.fieldErrors?.baseCvId ? (
						<p role="alert" className="text-sm text-red-700">
							{createFetcher.data.fieldErrors.baseCvId}
						</p>
					) : null}
				</div>

				<div className="grid gap-2">
					<Label htmlFor={`${formId}-format`}>Format</Label>
					<Select
						value={format}
						onValueChange={(value) => setFormat(value as GeneratedCvFormat)}
						disabled={submitting}
					>
						<SelectTrigger id={`${formId}-format`} aria-label="Output format">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="DOCX">DOCX (Recommended)</SelectItem>
							<SelectItem value="PDF">PDF</SelectItem>
							<SelectItem value="MARKDOWN">Markdown</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div className="grid gap-2">
					<Label htmlFor={`${formId}-job-description`}>Job Description</Label>
					<Textarea
						id={`${formId}-job-description`}
						name="jobDescription"
						value={jobDescription}
						onChange={(event) => setJobDescription(event.target.value)}
						disabled={submitting}
						aria-required="true"
						placeholder="Paste the job description"
						className="min-h-36"
					/>
					{createFetcher.data?.fieldErrors?.jobDescription ? (
						<p role="alert" className="text-sm text-red-700">
							{createFetcher.data.fieldErrors.jobDescription}
						</p>
					) : null}
				</div>

				<div className="grid gap-2">
					<Label htmlFor={`${formId}-additional`}>Additional information (optional)</Label>
					<Textarea
						id={`${formId}-additional`}
						name="additionalInformation"
						value={additionalInformation}
						onChange={(event) => setAdditionalInformation(event.target.value)}
						disabled={submitting}
						placeholder="Anything else Gemini should emphasize"
					/>
					{createFetcher.data?.fieldErrors?.additionalInformation ? (
						<p role="alert" className="text-sm text-red-700">
							{createFetcher.data.fieldErrors.additionalInformation}
						</p>
					) : null}
				</div>

				{needsConsent ? (
					<label className="flex items-start gap-3 rounded-lg border border-light-gray bg-off-white p-3 text-sm text-dark-gray">
						<Checkbox
							checked={consentAccepted}
							onCheckedChange={(checked) => setConsentAccepted(checked === true)}
							disabled={submitting}
							aria-label="Consent to send data to Google Gemini"
						/>
						<span>
							I consent to sending my Base CV, Job Description, and additional information to Google
							Gemini for CV generation.
						</span>
					</label>
				) : null}

				{clientError ? (
					<p role="alert" className="text-sm text-red-700">
						{clientError}
					</p>
				) : null}
				{createFetcher.data?.ok === false ? (
					<p role="alert" className="text-sm text-red-700">
						{createFetcher.data.error}
					</p>
				) : null}

				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
						Cancel
					</Button>
					<Button type="submit" disabled={submitting || atLimit || baseCvs.length === 0}>
						{submitting ? (
							<>
								<LoaderCircle className="animate-spin" />
								Starting…
							</>
						) : (
							<>
								<Sparkles />
								Generate CV
							</>
						)}
					</Button>
				</DialogFooter>
			</createFetcher.Form>
		</DialogContent>
	);
}

function CompanyMark({
	companyName,
	logoUrl,
	size,
}: {
	companyName: string;
	logoUrl: string | null;
	size: "preparing" | "generated";
}) {
	const [failed, setFailed] = useState(false);
	const dimensions = size === "preparing" ? "h-9 w-9 text-xs" : "h-6 w-6 text-[10px]";

	if (!logoUrl || failed) {
		return (
			<span
				aria-hidden="true"
				className={cn(
					"inline-flex shrink-0 items-center justify-center rounded-md bg-lightest-accent font-semibold text-dark-accent",
					dimensions,
				)}
			>
				{companyMonogram(companyName)}
			</span>
		);
	}

	return (
		<img
			src={logoUrl}
			alt=""
			aria-hidden="true"
			className={cn(
				"shrink-0 rounded-md object-contain",
				size === "preparing" ? "h-9 max-h-9 w-auto max-w-9" : "h-6 max-h-6 w-auto max-w-6",
			)}
			onError={() => setFailed(true)}
		/>
	);
}

function ApplicationGenerateRow({
	application,
	generations,
	applicationCvs,
	baseCvs,
	consent,
	initialJobDescription,
	section,
}: {
	application: Application;
	generations: CvGeneration[];
	applicationCvs: ApplicationCv[];
	baseCvs: BaseCv[];
	consent: AiConsent;
	initialJobDescription: string;
	section: "preparing" | "generated";
}) {
	const cancelFetcher = useFetcher<GenerateActionData>();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [dialogSession, setDialogSession] = useState(0);
	const [expanded, setExpanded] = useState(() => shouldStartExpanded(generations));
	const panelId = useId();
	const latest = latestGeneration(generations);
	const atLimit = applicationCvs.length >= MAX_APPLICATION_CVS;
	const canGenerate = baseCvs.length > 0 && !atLimit;
	const cancelling = cancelFetcher.state !== "idle";
	const sortedCvs = applicationCvs.toSorted((left, right) => right.version - left.version);
	const hasActiveGeneration = generations.some((generation) =>
		isActiveCvGenerationStatus(generation.status),
	);
	const activeGeneration =
		generations.find((generation) => generation.status === "PROCESSING") ??
		generations.find((generation) => generation.status === "PENDING") ??
		null;
	const statusOption = getApplicationStatusOption(application.applicationStatus);
	const placeLabel = locationRemoteLabel(application);
	const stateLabel = generationStateLabel(generations, applicationCvs.length > 0);
	const activityAt =
		section === "generated"
			? generatedActivityAt(applicationCvs)
			: preparingActivityAt(application, generations);
	const relativeActivity = activityAt ? formatRelativeTime(activityAt) : null;
	const absoluteActivity = activityAt ? formatAbsoluteTime(activityAt) : null;
	const closed =
		application.applicationStatus === "REJECTED" ||
		application.applicationStatus === "WITHDRAWN";
	const formatModelParts: string[] = [];
	if (latest?.requestedFormat) {
		formatModelParts.push(formatLabels[latest.requestedFormat]);
	}
	if (latest?.modelId) {
		formatModelParts.push(humanizeModelId(latest.modelId));
	}
	const newestCv = newestGeneratedCv(applicationCvs);
	const cvCount = applicationCvs.length;

	const openDialog = () => {
		setDialogSession((value) => value + 1);
		setDialogOpen(true);
	};

	const toggleExpanded = () => setExpanded((value) => !value);

	const generateButton = (
		<Button
			type="button"
			size="sm"
			onClick={(event) => {
				event.stopPropagation();
				openDialog();
			}}
			disabled={!canGenerate}
			aria-label={`Generate CV for ${application.applicationTitle}`}
		>
			<Sparkles />
			{section === "generated" ? "Generate again" : "Generate"}
		</Button>
	);

	const activeIndicator = hasActiveGeneration ? (
		<span className="inline-flex items-center gap-1.5 text-sm font-medium text-dark-accent">
			<LoaderCircle className="animate-spin" size={14} aria-hidden="true" />
			{activeGeneration?.status === "PENDING" ? "Queued" : "Generating"}
		</span>
	) : null;

	return (
		<li className="border-b border-light-gray last:border-b-0">
			<div className="flex items-start gap-3 py-3">
				<CompanyMark
					companyName={application.company.companyName}
					logoUrl={application.company.companyLogo}
					size={section === "preparing" ? "preparing" : "generated"}
				/>
				<div className="min-w-0 flex-1">
					<button
						type="button"
						className="flex w-full min-w-0 items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dark-accent/40 focus-visible:ring-offset-2"
						aria-expanded={expanded}
						aria-controls={panelId}
						aria-label={`${expanded ? "Collapse" : "Expand"} ${application.applicationTitle} at ${application.company.companyName}`}
						onClick={toggleExpanded}
					>
						<span className="min-w-0 flex-1">
							<span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
								<span className="truncate font-semibold text-dark-gray">
									{application.applicationTitle}
								</span>
								<span className="truncate text-sm text-medium-gray" aria-hidden="true">
									{application.company.companyName}
								</span>
								{section === "generated" && closed ? (
									<span
										className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
										style={{ backgroundColor: statusOption.color }}
									>
										{statusOption.label}
									</span>
								) : null}
							</span>
							{section === "preparing" ? (
								<span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-medium-gray">
									<span
										className="rounded-full px-2 py-0.5 font-medium text-white"
										style={{ backgroundColor: statusOption.color }}
									>
										{statusOption.label}
									</span>
									{placeLabel ? <span>{placeLabel}</span> : null}
									{!hasActiveGeneration ? (
										<span className="font-medium text-dark-gray">{stateLabel}</span>
									) : null}
									{formatModelParts.length > 0 ? (
										<span
											title={latest?.modelId ?? undefined}
											className="text-medium-gray"
										>
											{formatModelParts.join(" · ")}
										</span>
									) : null}
									{relativeActivity && absoluteActivity ? (
										<time dateTime={activityAt} title={absoluteActivity}>
											{relativeActivity}
										</time>
									) : null}
								</span>
							) : (
								<span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-medium-gray">
									<span>
										{cvCount} Generated CV{cvCount === 1 ? "" : "s"}
									</span>
									{relativeActivity && absoluteActivity && newestCv ? (
										<time dateTime={activityAt} title={absoluteActivity}>
											{relativeActivity}
										</time>
									) : null}
								</span>
							)}
						</span>
						<ChevronDown
							aria-hidden="true"
							className={cn(
								"mt-1 shrink-0 text-medium-gray transition-transform",
								expanded && "rotate-180",
							)}
							size={16}
						/>
					</button>
				</div>
				<div className="shrink-0 pt-0.5">
					{section === "preparing"
						? hasActiveGeneration
							? activeIndicator
							: generateButton
						: null}
				</div>
			</div>

			{expanded ? (
				<div id={panelId} className="space-y-3 pb-4 pl-12">
					{section === "generated" ? (
						<div className="flex flex-wrap items-center gap-2">
							{generateButton}
						</div>
					) : null}

					{latest ? (
						<div className="rounded-lg bg-off-white px-3 py-2">
							<p className="text-sm text-dark-gray">
								<span className="font-semibold">Latest status: </span>
								{cvGenerationStatusLabels[latest.status]}
							</p>
							{latest.modelId ? (
								<p className="mt-1 text-xs text-medium-gray" title={latest.modelId}>
									Model: {humanizeModelId(latest.modelId)}
								</p>
							) : null}
							{latest.status === "FAILED" ? (
								<div className="mt-1 space-y-1 text-sm text-red-700">
									{latest.errorMessage ? <p>{latest.errorMessage}</p> : null}
									{latest.correlationId ? (
										<p className="font-mono text-xs text-red-600">
											Reference: {latest.correlationId}
										</p>
									) : null}
								</div>
							) : null}
							{latest.status === "PENDING" ? (
								<cancelFetcher.Form method="post" action="/generate" className="mt-2">
									<input type="hidden" name="intent" value="cancel" />
									<input type="hidden" name="cvGenerationId" value={latest.cvGenerationId} />
									<Button
										type="submit"
										variant="outline"
										size="sm"
										disabled={cancelling}
										aria-label={`Cancel generation for ${application.applicationTitle}`}
										onClick={(event) => event.stopPropagation()}
									>
										{cancelling ? <LoaderCircle className="animate-spin" /> : <XCircle />}
										Cancel
									</Button>
								</cancelFetcher.Form>
							) : null}
							{cancelFetcher.data?.ok === false ? (
								<p role="alert" className="mt-2 text-sm text-red-700">
									{cancelFetcher.data.error}
								</p>
							) : null}
						</div>
					) : (
						<p className="text-sm text-medium-gray">No generations yet</p>
					)}

					{atLimit ? (
						<p className="text-sm text-amber-800">
							Generated CV limit reached ({applicationCvs.length} / {MAX_APPLICATION_CVS}). Delete
							one to make room.
						</p>
					) : null}

					{sortedCvs.length > 0 ? (
						<div>
							<h3 className="text-sm font-semibold text-darkest-accent">Successful versions</h3>
							<ul className="mt-2 space-y-2">
								{sortedCvs.map((applicationCv) => (
									<ApplicationCvRow
										key={applicationCv.applicationCvId}
										applicationCv={applicationCv}
									/>
								))}
							</ul>
						</div>
					) : null}
				</div>
			) : (
				<div id={panelId} hidden />
			)}

			<GenerateDialog
				application={application}
				baseCvs={baseCvs}
				consent={consent}
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				atLimit={atLimit}
				session={dialogSession}
				initialJobDescription={initialJobDescription}
			/>
		</li>
	);
}

export function GenerateRoute() {
	const {
		applications,
		baseCvs,
		generations,
		applicationCvsByApplicationId,
		jobDescriptionsByApplicationId,
		consent,
	} = useLoaderData() as GenerateLoaderData;
	const revalidator = useRevalidator();
	const [generatedSectionOpen, setGeneratedSectionOpen] = useState(true);
	const generatedPanelId = useId();
	const hasActiveGeneration = generations.some((generation) =>
		isActiveCvGenerationStatus(generation.status),
	);

	useEffect(() => {
		if (!hasActiveGeneration) return;
		const intervalId = window.setInterval(() => {
			if (revalidator.state === "idle") {
				revalidator.revalidate();
			}
		}, POLL_INTERVAL_MS);
		return () => window.clearInterval(intervalId);
	}, [hasActiveGeneration, revalidator]);

	const { preparing, generated } = buildGenerateSections(
		applications,
		generations,
		applicationCvsByApplicationId,
	);

	const renderSectionItems = (
		items: GenerateSectionItem[],
		section: "preparing" | "generated",
	) => (
		<ul className="divide-y divide-light-gray border-y border-light-gray">
			{items.map(({ application, generations: applicationGenerations, applicationCvs }) => (
				<ApplicationGenerateRow
					key={application.applicationId}
					application={application}
					generations={applicationGenerations}
					applicationCvs={applicationCvs}
					baseCvs={baseCvs}
					consent={consent}
					initialJobDescription={jobDescriptionsByApplicationId[application.applicationId] ?? ""}
					section={section}
				/>
			))}
		</ul>
	);

	return (
		<div className="h-full overflow-y-auto px-4 pb-12">
			<section className="mx-auto max-w-4xl">
				<div className="mb-6">
					<h1 className="text-2xl font-bold text-darkest-accent sm:text-3xl">Generate</h1>
					<p className="mt-1 text-medium-gray">
						Create tailored application CVs from your Base CV library.
					</p>
				</div>

				{hasActiveGeneration ? (
					<p className="mb-4 flex items-center gap-2 text-sm text-dark-accent" aria-live="polite">
						<LoaderCircle className="animate-spin" size={16} />
						Updating generation status…
					</p>
				) : null}

				{baseCvs.length === 0 ? (
					<p
						role="status"
						className="mb-4 rounded-lg border border-light-gray bg-white px-3 py-2 text-sm text-medium-gray"
					>
						Upload a Base CV in Documents before you can generate tailored CVs.
					</p>
				) : null}

				{applications.length === 0 ? (
					<div className="flex flex-col items-center py-12 text-center text-medium-gray">
						<Sparkles className="mb-3" size={32} />
						<h2 className="font-semibold text-dark-gray">No applications yet</h2>
						<p className="mt-1 max-w-md text-sm">
							Add an application on the board, then return here to generate a tailored CV.
						</p>
					</div>
				) : preparing.length === 0 && generated.length === 0 ? (
					<div className="flex flex-col items-center py-12 text-center text-medium-gray">
						<Sparkles className="mb-3" size={32} />
						<h2 className="font-semibold text-dark-gray">Nothing to generate right now</h2>
						<p className="mt-1 max-w-md text-sm">
							Rejected and withdrawn closed applications without a generated CV are hidden.
							Add or reopen an application on the board to prepare a tailored CV.
						</p>
					</div>
				) : (
					<div className="space-y-8">
						<section aria-labelledby="generate-preparing-heading">
							<h2
								id="generate-preparing-heading"
								className="mb-3 text-lg font-semibold text-darkest-accent"
							>
								Preparing
							</h2>
							{preparing.length > 0 ? (
								renderSectionItems(preparing, "preparing")
							) : (
								<p className="rounded-lg border border-dashed border-light-gray px-3 py-4 text-sm text-medium-gray">
									Nothing to prepare
								</p>
							)}
						</section>
						{generated.length > 0 ? (
							<section aria-labelledby="generate-generated-heading">
								<h2 id="generate-generated-heading" className="mb-3">
									<button
										type="button"
										className="flex w-full items-center justify-between gap-2 text-left text-lg font-semibold text-darkest-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dark-accent/40 focus-visible:ring-offset-2"
										aria-expanded={generatedSectionOpen}
										aria-controls={generatedPanelId}
										onClick={() => setGeneratedSectionOpen((value) => !value)}
									>
										Generated
										<ChevronDown
											aria-hidden="true"
											className={cn(
												"shrink-0 text-medium-gray transition-transform",
												generatedSectionOpen && "rotate-180",
											)}
											size={18}
										/>
									</button>
								</h2>
								{generatedSectionOpen ? (
									<div id={generatedPanelId}>{renderSectionItems(generated, "generated")}</div>
								) : (
									<div id={generatedPanelId} hidden />
								)}
							</section>
						) : null}
					</div>
				)}
			</section>
		</div>
	);
}
