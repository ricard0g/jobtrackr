import {
	Download,
	FileText,
	LoaderCircle,
	Sparkles,
	Trash2,
	XCircle,
} from "lucide-react";
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
import type { Application } from "@/types/application";
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

const formatLabels = { PDF: "PDF", DOCX: "DOCX", MARKDOWN: "Markdown" } as const;
const POLL_INTERVAL_MS = 3_000;

const formatBytes = (bytes: number) =>
	new Intl.NumberFormat("en", {
		style: "unit",
		unit: bytes >= 1024 * 1024 ? "megabyte" : "kilobyte",
		maximumFractionDigits: 1,
	}).format(bytes / (bytes >= 1024 * 1024 ? 1024 * 1024 : 1024));

const formatDate = (value: string) =>
	new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

const openSignedDownload = (uri: string) => {
	const link = document.createElement("a");
	link.href = uri;
	link.rel = "noopener noreferrer";
	link.target = "_blank";
	link.click();
};

const latestGeneration = (generations: CvGeneration[]) =>
	generations.toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;

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
					{formatBytes(applicationCv.byteSize)} · {formatDate(applicationCv.createdAt)}
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
							<SelectItem value="PDF">PDF</SelectItem>
							<SelectItem value="DOCX">DOCX</SelectItem>
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

function ApplicationGenerateRow({
	application,
	generations,
	applicationCvs,
	baseCvs,
	consent,
	initialJobDescription,
}: {
	application: Application;
	generations: CvGeneration[];
	applicationCvs: ApplicationCv[];
	baseCvs: BaseCv[];
	consent: AiConsent;
	initialJobDescription: string;
}) {
	const cancelFetcher = useFetcher<GenerateActionData>();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [dialogSession, setDialogSession] = useState(0);
	const latest = latestGeneration(generations);
	const atLimit = applicationCvs.length >= MAX_APPLICATION_CVS;
	const cancelling = cancelFetcher.state !== "idle";
	const sortedCvs = applicationCvs.toSorted((left, right) => right.version - left.version);

	const openDialog = () => {
		setDialogSession((value) => value + 1);
		setDialogOpen(true);
	};

	return (
		<li className="rounded-xl border border-light-gray bg-white p-4">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0 flex-1">
					<div className="flex items-start gap-3">
						<div className="rounded-lg bg-lightest-accent p-2 text-dark-accent">
							<FileText aria-hidden="true" />
						</div>
						<div className="min-w-0">
							<p className="truncate font-semibold text-dark-gray">{application.applicationTitle}</p>
							<p className="mt-1 text-sm text-medium-gray">{application.company.companyName}</p>
						</div>
					</div>

					{latest ? (
						<div className="mt-4 rounded-lg bg-off-white px-3 py-2">
							<p className="text-sm text-dark-gray">
								<span className="font-semibold">Latest status: </span>
								{cvGenerationStatusLabels[latest.status]}
							</p>
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
						<p className="mt-4 text-sm text-medium-gray">No generations yet</p>
					)}
				</div>

				<Button
					type="button"
					onClick={openDialog}
					disabled={atLimit}
					aria-label={`Generate CV for ${application.applicationTitle}`}
				>
					<Sparkles />
					Generate
				</Button>
			</div>

			{atLimit ? (
				<p className="mt-3 text-sm text-amber-800">
					Generated CV limit reached ({applicationCvs.length} / {MAX_APPLICATION_CVS}). Delete one to
					make room.
				</p>
			) : null}

			{sortedCvs.length > 0 ? (
				<div className="mt-4">
					<h3 className="text-sm font-semibold text-darkest-accent">Successful versions</h3>
					<ul className="mt-2 space-y-2">
						{sortedCvs.map((applicationCv) => (
							<ApplicationCvRow key={applicationCv.applicationCvId} applicationCv={applicationCv} />
						))}
					</ul>
				</div>
			) : null}

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

	const generationsByApplicationId = applications.reduce<Record<number, CvGeneration[]>>(
		(accumulator, application) => {
			accumulator[application.applicationId] = generations.filter(
				(generation) => generation.applicationId === application.applicationId,
			);
			return accumulator;
		},
		{},
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

				<div className="rounded-2xl border border-light-gray bg-off-white p-4 shadow-cool-light sm:p-6">
					{hasActiveGeneration ? (
						<p className="mb-4 flex items-center gap-2 text-sm text-dark-accent" aria-live="polite">
							<LoaderCircle className="animate-spin" size={16} />
							Updating generation status…
						</p>
					) : null}

					{baseCvs.length === 0 ? (
						<p className="mb-4 rounded-lg border border-light-gray bg-white px-3 py-2 text-sm text-medium-gray">
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
					) : (
						<ul className="space-y-3">
							{applications.map((application) => (
								<ApplicationGenerateRow
									key={application.applicationId}
									application={application}
									generations={generationsByApplicationId[application.applicationId] ?? []}
									applicationCvs={
										applicationCvsByApplicationId[application.applicationId] ?? []
									}
									baseCvs={baseCvs}
									consent={consent}
									initialJobDescription={
										jobDescriptionsByApplicationId[application.applicationId] ?? ""
									}
								/>
							))}
						</ul>
					)}
				</div>
			</section>
		</div>
	);
}
