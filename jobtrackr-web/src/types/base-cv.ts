export type BaseCvFormat = "PDF" | "DOCX" | "MARKDOWN";

export type BaseCv = {
	baseCvId: number;
	originalFilename: string;
	format: BaseCvFormat;
	contentType: string;
	byteSize: number;
	createdAt: string;
};
