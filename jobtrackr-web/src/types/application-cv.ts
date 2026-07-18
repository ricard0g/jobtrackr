import type { GeneratedCvFormat } from "@/types/cv-generation";

export type ApplicationCv = {
	applicationCvId: number;
	applicationId: number;
	version: number;
	originalFilename: string;
	format: GeneratedCvFormat;
	contentType: string;
	byteSize: number;
	generationId: number | null;
	createdAt: string;
};

export type ApplicationCvDownload = {
	uri: string;
};
