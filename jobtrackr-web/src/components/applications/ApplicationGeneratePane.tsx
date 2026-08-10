import {
	ChevronDown,
	Download,
	Loader2,
	LoaderCircle,
	Sparkles,
	Trash2,
	XCircle,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
	useFetcher,
	useLocation,
	useParams,
	useRevalidator,
	useRouteLoaderData,
} from "react-router";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getGenerateFormDisclosure } from "@/routes/application-generate-disclosure";
import {
	APPLICATION_GENERATE_ROUTE_ID,
	type ApplicationGenerateActionData,
	type ApplicationGenerateLoaderData,
} from "@/routes/application-generate-data";
import {
	activeElapsedStartedAt,
	formatAbsoluteTime,
	formatElapsedDuration,
} from "@/routes/generate-display";
import { MAX_GENERATED_CVS } from "@/routes/generate-data";
import {
	cvGenerationStatusLabels,
	isActiveCvGenerationStatus,
	type CvGeneration,
	type GeneratedCvFormat,
} from "@/types/cv-generation";
import type { GeneratedCv } from "@/types/generated-cv";

const GENERATE_POLL_INTERVAL_MS = 3_000;
const ELAPSED_TICK_MS = 1_000;

const formatLabels = { PDF: "PDF", DOCX: "DOCX", MARKDOWN: "Markdown" } as const;

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

function useNow(enabled: boolean): Date {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		if (!enabled) return;
		setNow(new Date());
		const intervalId = window.setInterval(() => setNow(new Date()), ELAPSED_TICK_MS);
		return () => window.clearInterval(intervalId);
	}, [enabled]);
	return enabled ? now : new Date();
}

function pickActiveGeneration(generations: CvGeneration[]): CvGeneration | null {
	return (
		generations.find((generation) => generation.status === "PROCESSING") ??
		generations.find((generation) => generation.status === "PENDING") ??
		null
	);
}

function ActiveCvGenerationCard({
	generation,
	applicationId,
	now,
}: {
	generation: CvGeneration;
	applicationId: number;
	now: Date;
}) {
	const cancelFetcher = useFetcher<ApplicationGenerateActionData>();
	const cancelling = cancelFetcher.state !== "idle";
	const statusLabel = cvGenerationStatusLabels[generation.status];
	const elapsed = formatElapsedDuration(activeElapsedStartedAt(generation), now);
	const canCancel = generation.status === "PENDING";

	return (
		<section
			aria-label="Active CV Generation"
			className="rounded-lg border border-light-gray bg-off-white px-3 py-3"
		>
			<div className="flex flex-wrap items-center gap-2 text-sm font-medium text-dark-accent">
				<LoaderCircle className="size-4 animate-spin" aria-hidden />
				<span>{statusLabel}</span>
				<span className="text-medium-gray" aria-label="Elapsed time">
					· {elapsed}
				</span>
			</div>
			{canCancel ? (
				<cancelFetcher.Form
					method="post"
					action={`/applications/${applicationId}/generate`}
					className="mt-2"
				>
					<input type="hidden" name="intent" value="cancel" />
					<input type="hidden" name="cvGenerationId" value={generation.cvGenerationId} />
					<Button
						type="submit"
						variant="outline"
						size="sm"
						disabled={cancelling}
						aria-label="Cancel CV Generation"
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
		</section>
	);
}

function GeneratedCvRow({
	generatedCv,
	applicationId,
}: {
	generatedCv: GeneratedCv;
	applicationId: number;
}) {
	const deleteFetcher = useFetcher<ApplicationGenerateActionData>();
	const downloadFetcher = useFetcher<ApplicationGenerateActionData>();
	const openedDownloadRef = useRef<ApplicationGenerateActionData | null>(null);
	const deleting = deleteFetcher.state !== "idle";
	const downloading = downloadFetcher.state !== "idle";
	const actionPath = `/applications/${applicationId}/generate`;

	useEffect(() => {
		if (downloadFetcher.state !== "idle") return;
		const data = downloadFetcher.data;
		if (!data?.ok || data.intent !== "download-cv" || !data.uri) return;
		if (openedDownloadRef.current === data) return;
		openedDownloadRef.current = data;
		openSignedDownload(data.uri);
	}, [downloadFetcher.state, downloadFetcher.data]);

	const confirmDelete = (event: React.FormEvent<HTMLFormElement>) => {
		if (!window.confirm(`Permanently delete ${generatedCv.originalFilename}?`)) {
			event.preventDefault();
		}
	};

	return (
		<li className="flex flex-wrap items-start gap-3 rounded-lg border border-light-gray bg-white px-3 py-2">
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-semibold text-dark-gray">
					{generatedCv.originalFilename}
				</p>
				<p className="mt-0.5 text-xs text-medium-gray">
					v{generatedCv.version} · {formatLabels[generatedCv.format]} ·{" "}
					{formatBytes(generatedCv.byteSize)} · {formatAbsoluteTime(generatedCv.createdAt)}
				</p>
			</div>
			<div className="flex gap-1">
				<downloadFetcher.Form method="post" action={actionPath}>
					<input type="hidden" name="intent" value="download-cv" />
					<input type="hidden" name="generatedCvId" value={generatedCv.generatedCvId} />
					<Button
						type="submit"
						variant="ghost"
						size="sm"
						disabled={downloading}
						aria-label={`Download ${generatedCv.originalFilename}`}
					>
						{downloading ? <LoaderCircle className="animate-spin" /> : <Download />}
					</Button>
				</downloadFetcher.Form>
				<deleteFetcher.Form method="post" action={actionPath} onSubmit={confirmDelete}>
					<input type="hidden" name="intent" value="delete-cv" />
					<input type="hidden" name="generatedCvId" value={generatedCv.generatedCvId} />
					<Button
						type="submit"
						variant="ghost"
						size="sm"
						disabled={deleting}
						aria-label={`Delete ${generatedCv.originalFilename}`}
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

function GeneratedCvList({
	generatedCvs,
	applicationId,
}: {
	generatedCvs: GeneratedCv[];
	applicationId: number;
}) {
	const sortedCvs = generatedCvs.toSorted((left, right) => right.version - left.version);
	const atLimit = generatedCvs.length >= MAX_GENERATED_CVS;

	return (
		<section aria-label="Generated CVs" className="space-y-2">
			<div className="flex items-baseline justify-between gap-2">
				<h3 className="text-sm font-semibold text-darkest-accent">Generated CVs</h3>
				<span className="text-xs text-medium-gray">
					{generatedCvs.length} / {MAX_GENERATED_CVS}
				</span>
			</div>
			{atLimit ? (
				<p className="text-sm text-amber-800">
					Generated CV limit reached ({generatedCvs.length} / {MAX_GENERATED_CVS}). Delete one
					to make room.
				</p>
			) : null}
			{sortedCvs.length === 0 ? (
				<p className="text-sm text-medium-gray">No Generated CVs yet for this Application.</p>
			) : (
				<ul className="space-y-2">
					{sortedCvs.map((generatedCv) => (
						<GeneratedCvRow
							key={generatedCv.generatedCvId}
							generatedCv={generatedCv}
							applicationId={applicationId}
						/>
					))}
				</ul>
			)}
		</section>
	);
}

function ApplicationGenerateForm({
	data,
	applicationId,
}: {
	data: ApplicationGenerateLoaderData;
	applicationId: number;
}) {
	const createFetcher = useFetcher<ApplicationGenerateActionData>();
	const formId = useId();
	const panelId = useId();
	const { baseCvs, consent, jobDescription, generations, generatedCvs } = data;

	const hasActiveGeneration = generations.some((generation) =>
		isActiveCvGenerationStatus(generation.status),
	);
	const disclosure = getGenerateFormDisclosure({
		hasActiveGeneration,
		generatedCvCount: generatedCvs.length,
	});
	const [expanded, setExpanded] = useState(disclosure.defaultExpanded);
	const [baseCvId, setBaseCvId] = useState(() =>
		baseCvs[0] ? String(baseCvs[0].baseCvId) : "",
	);
	const [format, setFormat] = useState<GeneratedCvFormat>("DOCX");
	const [jobDescriptionValue, setJobDescriptionValue] = useState(jobDescription);
	const [additionalInformation, setAdditionalInformation] = useState("");
	const [consentAccepted, setConsentAccepted] = useState(false);
	const [clientError, setClientError] = useState<string | null>(null);

	const atLimit = generatedCvs.length >= MAX_GENERATED_CVS;
	const submitting = createFetcher.state !== "idle";
	const needsConsent = !consent.current;
	const submitDisabled =
		submitting || atLimit || baseCvs.length === 0 || !disclosure.canSubmit;

	useEffect(() => {
		setExpanded(disclosure.defaultExpanded);
	}, [disclosure.defaultExpanded, data.applicationId]);

	const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		setClientError(null);
		if (!disclosure.canSubmit) {
			event.preventDefault();
			setClientError("A CV Generation is already in progress for this Application.");
			return;
		}
		if (!baseCvId) {
			event.preventDefault();
			setClientError("Choose a Base CV.");
			return;
		}
		if (!jobDescriptionValue.trim()) {
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
		<div className="rounded-lg border border-light-gray bg-off-white">
			<button
				type="button"
				className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm font-medium text-dark-gray"
				aria-expanded={expanded}
				aria-controls={panelId}
				onClick={() => setExpanded((previous) => !previous)}
			>
				<span>{disclosure.label}</span>
				<ChevronDown
					className={
						expanded
							? "size-4 shrink-0 rotate-180 transition-transform"
							: "size-4 shrink-0 transition-transform"
					}
					aria-hidden
				/>
			</button>

			{expanded ? (
				<div id={panelId} className="border-t border-light-gray px-3 pb-3 pt-3">
					<p className="mb-3 rounded-lg border border-light-gray bg-lightest-accent px-3 py-2 text-sm text-dark-gray">
						Your Base CV, Job Description, and any additional information will be sent to Google
						Gemini to generate a tailored document.
					</p>

					{atLimit ? (
						<p role="alert" className="mb-3 text-sm text-amber-800">
							This application already has {MAX_GENERATED_CVS} generated CVs. Delete one before
							generating another.
						</p>
					) : null}

					{!disclosure.canSubmit ? (
						<p role="alert" className="mb-3 text-sm text-amber-800">
							A CV Generation is already in progress for this Application.
						</p>
					) : null}

					{baseCvs.length === 0 ? (
						<p role="alert" className="mb-3 text-sm text-amber-800">
							Upload a Base CV in Documents before generating.
						</p>
					) : null}

					<createFetcher.Form
						method="post"
						action={`/applications/${applicationId}/generate`}
						aria-label="Start CV Generation"
						className="grid gap-4"
						noValidate
						onSubmit={onSubmit}
					>
						<input type="hidden" name="intent" value="create" />
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
								disabled={submitting || baseCvs.length === 0 || !disclosure.canSubmit}
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
								disabled={submitting || !disclosure.canSubmit}
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
								value={jobDescriptionValue}
								onChange={(event) => setJobDescriptionValue(event.target.value)}
								disabled={submitting || !disclosure.canSubmit}
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
								disabled={submitting || !disclosure.canSubmit}
								placeholder="Anything else Gemini should emphasize"
							/>
							{createFetcher.data?.fieldErrors?.additionalInformation ? (
								<p role="alert" className="text-sm text-red-700">
									{createFetcher.data.fieldErrors.additionalInformation}
								</p>
							) : null}
						</div>

						{needsConsent ? (
							<label className="flex items-start gap-3 rounded-lg border border-light-gray bg-background p-3 text-sm text-dark-gray">
								<Checkbox
									checked={consentAccepted}
									onCheckedChange={(checked) => setConsentAccepted(checked === true)}
									disabled={submitting || !disclosure.canSubmit}
									aria-label="Consent to send data to Google Gemini"
								/>
								<span>
									I consent to sending my Base CV, Job Description, and additional information to
									Google Gemini for CV generation.
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

						<div className="flex justify-end">
							<Button type="submit" disabled={submitDisabled}>
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
						</div>
					</createFetcher.Form>
				</div>
			) : null}
		</div>
	);
}

export function ApplicationGeneratePane({ loading = false }: { loading?: boolean }) {
	const params = useParams();
	const location = useLocation();
	const revalidator = useRevalidator();
	const applicationId = Number(params.applicationId);
	const routeData = useRouteLoaderData(
		APPLICATION_GENERATE_ROUTE_ID,
	) as ApplicationGenerateLoaderData | undefined;
	const refreshFetcher = useFetcher<ApplicationGenerateLoaderData>();
	const onGenerateUrl = location.pathname.endsWith("/generate");
	// Retain last Generate payload while the pane stays mounted after leaving the
	// child URL (Details tab). Prefer live route / refresh fetcher data when available.
	const retainedDataRef = useRef(routeData);
	if (routeData) {
		retainedDataRef.current = routeData;
	}
	if (refreshFetcher.data) {
		retainedDataRef.current = refreshFetcher.data;
	}
	const data = routeData ?? refreshFetcher.data ?? retainedDataRef.current;
	const hasActiveGeneration =
		data?.generations.some((generation) =>
			isActiveCvGenerationStatus(generation.status),
		) ?? false;
	const activeGeneration = data ? pickActiveGeneration(data.generations) : null;
	const now = useNow(Boolean(activeGeneration));

	// Prefetch only: when the pane is mounted off /generate without data (active-run
	// early mount). First visits to /generate rely on the child route loader alone.
	useEffect(() => {
		if (onGenerateUrl) return;
		if (data || !Number.isInteger(applicationId) || applicationId <= 0) return;
		if (refreshFetcher.state !== "idle") return;
		void refreshFetcher.load(`/applications/${applicationId}/generate`);
	}, [onGenerateUrl, data, applicationId, refreshFetcher]);

	useEffect(() => {
		if (!hasActiveGeneration || !Number.isInteger(applicationId) || applicationId <= 0) {
			return;
		}
		const intervalId = window.setInterval(() => {
			if (onGenerateUrl) {
				if (revalidator.state === "idle") {
					void revalidator.revalidate();
				}
				return;
			}
			if (refreshFetcher.state === "idle") {
				void refreshFetcher.load(`/applications/${applicationId}/generate`);
			}
		}, GENERATE_POLL_INTERVAL_MS);
		return () => window.clearInterval(intervalId);
	}, [hasActiveGeneration, applicationId, onGenerateUrl, revalidator, refreshFetcher]);

	if ((loading && !data) || !data || !Number.isInteger(applicationId) || applicationId <= 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-sm text-medium-gray">
				<Loader2 className="size-5 animate-spin" aria-hidden />
				<p>Loading Generate…</p>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col gap-3 p-1">
			{activeGeneration ? (
				<ActiveCvGenerationCard
					generation={activeGeneration}
					applicationId={applicationId}
					now={now}
				/>
			) : null}
			<ApplicationGenerateForm data={data} applicationId={applicationId} />
			<GeneratedCvList generatedCvs={data.generatedCvs} applicationId={applicationId} />
		</div>
	);
}
