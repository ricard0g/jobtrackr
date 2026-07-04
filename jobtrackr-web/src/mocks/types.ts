import type {
	Application,
	StatusHistory,
} from "@/types/application";
import type { Company } from "@/types/company";
import type { Interview } from "@/types/interview";
import type { Tag } from "@/types/tag";
import type { User } from "@/types/user";

export type MockApplicationRecord = Omit<Application, "company" | "tags"> & {
	companyId: number;
	tagIds: number[];
};

export type MockCredentials = {
	userId: string;
	email: string;
	password: string;
};

export type MockSession = {
	userId: string;
	accessToken: string;
	refreshToken: string;
};

export type MockCounters = {
	applicationId: number;
	companyId: number;
	interviewId: number;
	statusHistoryId: number;
	tagId: number;
};

export type MockState = {
	version: 2;
	csrfToken: string;
	activeRefreshToken: string | null;
	users: User[];
	credentials: MockCredentials[];
	sessions: MockSession[];
	companies: Company[];
	tags: Tag[];
	applications: MockApplicationRecord[];
	interviews: Interview[];
	statusHistories: StatusHistory[];
	counters: MockCounters;
};

export type MockEntityName = keyof MockCounters;

export type AuthContext = {
	user: User;
	session: MockSession;
};

export type ErrorField = {
	field: string;
	message: string;
};

export type ErrorBody = {
	code: string;
	message: string;
	fieldErrors: ErrorField[] | null;
};

export type PathParams = Record<string, string | readonly string[] | undefined>;
