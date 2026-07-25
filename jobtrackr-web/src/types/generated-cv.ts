import type { GeneratedCvFormat } from "@/types/cv-generation";

export type GeneratedCv = {
	generatedCvId: number;
	applicationId: number;
	version: number;
	originalFilename: string;
	format: GeneratedCvFormat;
	contentType: string;
	byteSize: number;
	generationId: number | null;
	createdAt: string;
};

export type GeneratedCvSummary = GeneratedCv & {
	applicationTitle: string;
	companyName: string;
};

export type GeneratedCvPage = {
	items: GeneratedCvSummary[];
	nextCursor: string | null;
};

export type GeneratedCvDownload = {
	uri: string;
};
