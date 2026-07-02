export type InterviewType =
	| "PHONE"
	| "TECHNICAL"
	| "ARCHITECTURE"
	| "HR"
	| "FINAL"
	| "OTHER";

export type InterviewOutcome = "PENDING" | "PASSED" | "FAILED" | "CANCELLED";

export interface Interview {
	interviewId: number;
	applicationId: number;
	interviewType: InterviewType;
	interviewScheduledAt: string;
	interviewLocation: string | null;
	interviewNotes: string | null;
	interviewOutcome: InterviewOutcome;
	interviewCreatedAt: string;
	interviewUpdatedAt: string;
}

export interface InterviewCreateRequest {
	interviewType: InterviewType;
	interviewScheduledAt: string;
	interviewLocation?: string | null;
	interviewNotes?: string | null;
}

export interface InterviewPutRequest extends InterviewCreateRequest {
	interviewOutcome: InterviewOutcome;
}
