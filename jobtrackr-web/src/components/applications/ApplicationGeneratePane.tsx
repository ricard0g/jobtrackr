import { ChevronDown, LoaderCircle, Loader2, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
	useFetcher,
	useParams,
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
import { MAX_GENERATED_CVS } from "@/routes/generate-data";
import { isActiveCvGenerationStatus, type GeneratedCvFormat } from "@/types/cv-generation";

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
	const applicationId = Number(params.applicationId);
	const routeData = useRouteLoaderData(
		APPLICATION_GENERATE_ROUTE_ID,
	) as ApplicationGenerateLoaderData | undefined;
	// Retain last Generate payload while the pane stays mounted after leaving the
	// child URL (Details tab). Prefer live route data when the Generate route matches.
	const retainedDataRef = useRef(routeData);
	if (routeData) {
		retainedDataRef.current = routeData;
	}
	const data = routeData ?? retainedDataRef.current;

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
			<ApplicationGenerateForm data={data} applicationId={applicationId} />
		</div>
	);
}
