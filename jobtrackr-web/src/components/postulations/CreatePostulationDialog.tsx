import { CirclePlus, Loader2 } from "lucide-react";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";

import { useBoard } from "@/components/kanban/useBoard";
import { CompanyCombobox } from "@/components/postulations/CompanyCombobox";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ApiError, api } from "@/lib/api";
import {
	applicationStatusOptions,
	type Application,
	type ApplicationCreateRequest,
	type ApplicationStatus,
	type RemoteType,
} from "@/types/application";
import type { Company } from "@/types/company";

type CreateApplicationFormValues = {
	companyId: string;
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

type FormErrors = Partial<Record<keyof CreateApplicationFormValues, string>>;

interface CreatePostulationDialogProps {
	applications: Application[];
	defaultStatus?: ApplicationStatus;
	trigger?: ReactNode;
}

const remoteTypeOptions: Array<{ value: RemoteType; label: string }> = [
	{ value: "ON_SITE", label: "On-site" },
	{ value: "HYBRID", label: "Hybrid" },
	{ value: "REMOTE", label: "Remote" },
];

const getTodayInputValue = () => new Date().toISOString().slice(0, 10);

const initialFormValues = (
	defaultStatus: ApplicationStatus = "APPLIED",
): CreateApplicationFormValues => ({
	companyId: "",
	applicationTitle: "",
	applicationStatus: defaultStatus,
	applicationSalaryMin: "",
	applicationSalaryMax: "",
	applicationCurrency: "EUR",
	applicationLocation: "",
	applicationRemoteType: "NONE",
	applicationSource: "",
	applicationJobUrl: "",
	applicationAppliedAt: getTodayInputValue(),
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

export function CreatePostulationDialog({
	applications,
	defaultStatus = "APPLIED",
	trigger,
}: CreatePostulationDialogProps) {
	const { upsertApplication } = useBoard();
	const [open, setOpen] = useState(false);
	const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
	const [values, setValues] = useState<CreateApplicationFormValues>(() =>
		initialFormValues(defaultStatus),
	);
	const [errors, setErrors] = useState<FormErrors>({});
	const [serverError, setServerError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const statusOptions = useMemo(() => applicationStatusOptions, []);

	const updateValue = <T extends keyof CreateApplicationFormValues>(
		name: T,
		value: CreateApplicationFormValues[T],
	) => {
		setValues((currentValues) => ({
			...currentValues,
			[name]: value,
		}));
		setErrors((currentErrors) => ({
			...currentErrors,
			[name]: undefined,
		}));
		setServerError(null);
	};

	const resetForm = () => {
		setValues(initialFormValues(defaultStatus));
		setSelectedCompany(null);
		setErrors({});
		setServerError(null);
	};

	const buildPayload = () => {
		const nextErrors: FormErrors = {};
		const applicationSalaryMin = toNullableNumber(values.applicationSalaryMin);
		const applicationSalaryMax = toNullableNumber(values.applicationSalaryMax);

		if (!values.companyId) nextErrors.companyId = "Select a company.";
		if (!values.applicationTitle.trim()) {
			nextErrors.applicationTitle = "Enter the job title.";
		}
		if (!values.applicationStatus) {
			nextErrors.applicationStatus = "Select a status.";
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
			values.applicationCurrency.trim() &&
			!/^[A-Z]{3}$/.test(values.applicationCurrency.trim())
		) {
			nextErrors.applicationCurrency = "Use a 3-letter ISO code.";
		}

		setErrors(nextErrors);
		if (Object.keys(nextErrors).length > 0) return null;

		const applicationKanbanOrder = applications.filter(
			(application) =>
				application.applicationStatus === values.applicationStatus,
		).length;

		return {
			companyId: Number(values.companyId),
			applicationTitle: values.applicationTitle.trim(),
			applicationStatus: values.applicationStatus,
			applicationSalaryMin,
			applicationSalaryMax,
			applicationCurrency: toNullableString(values.applicationCurrency),
			applicationLocation: toNullableString(values.applicationLocation),
			applicationRemoteType:
				values.applicationRemoteType === "NONE"
					? null
					: values.applicationRemoteType,
			applicationSource: toNullableString(values.applicationSource),
			applicationJobUrl: toNullableString(values.applicationJobUrl),
			applicationAppliedAt: toOffsetDateTime(values.applicationAppliedAt),
			applicationKanbanOrder,
		} satisfies ApplicationCreateRequest;
	};

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const payload = buildPayload();
		if (!payload) return;

		setIsSubmitting(true);
		setServerError(null);

		try {
			const createdApplication = await api.createApplication(payload);
			upsertApplication(createdApplication, "append-to-status");
			resetForm();
			setOpen(false);
		} catch (error) {
			setServerError(
				error instanceof ApiError
					? error.message
					: "Could not create the application.",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (!nextOpen) resetForm();
			}}
		>
			<DialogTrigger asChild>
				{trigger ?? (
					<Button size="lg" variant="default">
						<CirclePlus /> Create Application
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="h-[85dvh] sm:h-fit max-h-[85dvh] min-w-0 overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Create application</DialogTitle>
					<DialogDescription>
						Enter the main job details to add it to the board.
					</DialogDescription>
				</DialogHeader>

				<Form className="grid min-w-0 gap-4" onSubmit={handleSubmit}>
					<div className="grid gap-4 sm:grid-cols-2">
						<FormField name="companyId">
							<FormLabel>Company</FormLabel>
							<CompanyCombobox
								value={values.companyId}
								selectedCompany={selectedCompany}
								onChange={(companyId, company) => {
									updateValue("companyId", companyId);
									setSelectedCompany(company);
								}}
								disabled={isSubmitting}
								invalid={Boolean(errors.companyId)}
							/>
							{errors.companyId && <FormMessage>{errors.companyId}</FormMessage>}
						</FormField>

						<FormField name="applicationStatus">
							<FormLabel>Status</FormLabel>
							<Select
								value={values.applicationStatus}
								onValueChange={(value) =>
									updateValue("applicationStatus", value as ApplicationStatus)
								}
								disabled={isSubmitting}
							>
								<SelectTrigger
									aria-invalid={Boolean(errors.applicationStatus)}
								>
									<SelectValue placeholder="Select status" />
								</SelectTrigger>
								<SelectContent>
									{statusOptions.map((status) => (
										<SelectItem key={status.value} value={status.value}>
											{status.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{errors.applicationStatus && (
								<FormMessage>{errors.applicationStatus}</FormMessage>
							)}
						</FormField>
					</div>

					<FormField name="applicationTitle">
						<FormLabel>Job title</FormLabel>
						<FormControl asChild>
							<Input
								value={values.applicationTitle}
								onChange={(event) =>
									updateValue("applicationTitle", event.target.value)
								}
								aria-invalid={Boolean(errors.applicationTitle)}
								disabled={isSubmitting}
								maxLength={255}
								placeholder="Junior Frontend Developer"
							/>
						</FormControl>
						{errors.applicationTitle && (
							<FormMessage>{errors.applicationTitle}</FormMessage>
						)}
					</FormField>

					<div className="grid gap-4 sm:grid-cols-3">
						<FormField name="applicationSalaryMin">
							<FormLabel>Minimum salary</FormLabel>
							<FormControl asChild>
								<Input
									type="number"
									value={values.applicationSalaryMin}
									onChange={(event) =>
										updateValue("applicationSalaryMin", event.target.value)
									}
									aria-invalid={Boolean(errors.applicationSalaryMin)}
									disabled={isSubmitting}
									min="0"
									step="0.01"
									placeholder="20000"
								/>
							</FormControl>
							{errors.applicationSalaryMin && (
								<FormMessage>{errors.applicationSalaryMin}</FormMessage>
							)}
						</FormField>

						<FormField name="applicationSalaryMax">
							<FormLabel>Maximum salary</FormLabel>
							<FormControl asChild>
								<Input
									type="number"
									value={values.applicationSalaryMax}
									onChange={(event) =>
										updateValue("applicationSalaryMax", event.target.value)
									}
									aria-invalid={Boolean(errors.applicationSalaryMax)}
									disabled={isSubmitting}
									min="0"
									step="0.01"
									placeholder="26000"
								/>
							</FormControl>
							{errors.applicationSalaryMax && (
								<FormMessage>{errors.applicationSalaryMax}</FormMessage>
							)}
						</FormField>

						<FormField name="applicationCurrency">
							<FormLabel>Currency</FormLabel>
							<FormControl asChild>
								<Input
									value={values.applicationCurrency}
									onChange={(event) =>
										updateValue(
											"applicationCurrency",
											event.target.value.toUpperCase(),
										)
									}
									aria-invalid={Boolean(errors.applicationCurrency)}
									disabled={isSubmitting}
									maxLength={3}
								/>
							</FormControl>
							{errors.applicationCurrency && (
								<FormMessage>{errors.applicationCurrency}</FormMessage>
							)}
						</FormField>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						<FormField name="applicationLocation">
							<FormLabel>Location</FormLabel>
							<FormControl asChild>
								<Input
									value={values.applicationLocation}
									onChange={(event) =>
										updateValue("applicationLocation", event.target.value)
									}
									disabled={isSubmitting}
									maxLength={255}
									placeholder="Madrid, Spain"
								/>
							</FormControl>
						</FormField>

						<FormField name="applicationRemoteType">
							<FormLabel>Work mode</FormLabel>
							<Select
								value={values.applicationRemoteType}
								onValueChange={(value) =>
									updateValue(
										"applicationRemoteType",
										value as RemoteType | "NONE",
									)
								}
								disabled={isSubmitting}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select work mode" />
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
								type="url"
								className="max-w-full"
								value={values.applicationJobUrl}
								onChange={(event) =>
									updateValue("applicationJobUrl", event.target.value)
								}
								disabled={isSubmitting}
								maxLength={1024}
								placeholder="https://..."
							/>
						</FormControl>
					</FormField>

					<div className="grid min-w-0 gap-4 sm:grid-cols-2">
						<FormField className="min-w-0" name="applicationSource">
							<FormLabel>Source</FormLabel>
							<FormControl asChild>
								<Input
									value={values.applicationSource}
									onChange={(event) =>
										updateValue("applicationSource", event.target.value)
									}
									disabled={isSubmitting}
									maxLength={255}
									placeholder="LinkedIn"
								/>
							</FormControl>
						</FormField>

						<FormField className="min-w-0 overflow-hidden" name="applicationAppliedAt">
							<FormLabel>Applied date</FormLabel>
							<FormControl>
								<div className="w-full min-w-0 max-w-full overflow-hidden">
									<Input
										type="date"
										className="box-border w-full min-w-0 max-w-full"
										value={values.applicationAppliedAt}
										onChange={(event) =>
											updateValue("applicationAppliedAt", event.target.value)
										}
										disabled={isSubmitting}
									/>
								</div>
							</FormControl>
						</FormField>
					</div>

					{serverError && (
						<p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
							{serverError}
						</p>
					)}

					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting && <Loader2 className="animate-spin" />}
							Create
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
