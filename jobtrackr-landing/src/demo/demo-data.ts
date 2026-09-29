// Every person, company, and document here is fictional. The Public Demo ships
// this prepared state only; it never reads or writes real User data.

export type ApplicationStatus =
  "APPLIED" | "IN_REVIEW" | "INTERVIEW" | "OFFER" | "REJECTED" | "WITHDRAWN";

export type RemoteType = "ON_SITE" | "HYBRID" | "REMOTE";

export interface DemoTag {
  name: string;
  color: string;
}

export interface DemoInterview {
  type: string;
  scheduledAt: string;
  location: string;
  outcome: "PENDING" | "PASSED" | "FAILED" | "CANCELLED";
  notes: string | null;
}

export interface DemoCvGeneration {
  id: number;
  status: "COMPLETED" | "FAILED";
  format: "PDF" | "DOCX" | "MD";
  requestedAt: string;
  completedAt: string;
  generatedCvVersion: number | null;
  errorMessage: string | null;
}

export interface DemoGeneratedCv {
  version: number;
  format: "PDF" | "DOCX" | "MD";
  filename: string;
  byteSize: number;
  createdAt: string;
}

export interface DemoApplication {
  id: number;
  company: string;
  title: string;
  status: ApplicationStatus;
  location: string | null;
  remoteType: RemoteType | null;
  source: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  appliedAt: string | null;
  tags: DemoTag[];
  interviews: DemoInterview[];
  cvGenerations: DemoCvGeneration[];
  generatedCvs: DemoGeneratedCv[];
}

export const statusColumns: Array<{
  value: ApplicationStatus;
  label: string;
  color: string;
}> = [
  { value: "APPLIED", label: "Applied", color: "#5765BD" },
  { value: "IN_REVIEW", label: "In Review", color: "#F5D800" },
  { value: "INTERVIEW", label: "Interview", color: "#00A7D6" },
  { value: "OFFER", label: "Offer", color: "#00A86B" },
  { value: "REJECTED", label: "Rejected", color: "#878787" },
  { value: "WITHDRAWN", label: "Withdrawn", color: "#9C7D48" },
];

const tags = {
  frontend: { name: "Frontend", color: "#5765BD" },
  react: { name: "React", color: "#00A7D6" },
  remote: { name: "Remote", color: "#00A86B" },
  data: { name: "Data", color: "#C2410C" },
  fintech: { name: "Fintech", color: "#9C7D48" },
  referral: { name: "Referral", color: "#BE185D" },
} satisfies Record<string, DemoTag>;

export const demoApplications: DemoApplication[] = [
  {
    id: 1,
    company: "Quanta Freight",
    title: "Logistics Data Analyst",
    status: "APPLIED",
    location: "Rotterdam, Netherlands",
    remoteType: "ON_SITE",
    source: "Company website",
    salaryMin: 48000,
    salaryMax: 56000,
    currency: "EUR",
    appliedAt: "2026-09-22",
    tags: [tags.data],
    interviews: [],
    cvGenerations: [],
    generatedCvs: [],
  },
  {
    id: 2,
    company: "Cobalt Studio",
    title: "UI Engineer",
    status: "APPLIED",
    location: "Remote, EU",
    remoteType: "REMOTE",
    source: "Job board",
    salaryMin: 52000,
    salaryMax: null,
    currency: "EUR",
    appliedAt: "2026-09-24",
    tags: [tags.frontend, tags.remote],
    interviews: [],
    cvGenerations: [
      {
        id: 21,
        status: "COMPLETED",
        format: "PDF",
        requestedAt: "2026-09-24T08:12:00Z",
        completedAt: "2026-09-24T08:13:10Z",
        generatedCvVersion: 1,
        errorMessage: null,
      },
    ],
    generatedCvs: [
      {
        version: 1,
        format: "PDF",
        filename: "alex-rivera-cobalt-studio-v1.pdf",
        byteSize: 84_210,
        createdAt: "2026-09-24T08:13:10Z",
      },
    ],
  },
  {
    id: 3,
    company: "Brightline Health",
    title: "Frontend Developer",
    status: "IN_REVIEW",
    location: "Madrid, Spain",
    remoteType: "HYBRID",
    source: "Referral",
    salaryMin: 45000,
    salaryMax: 52000,
    currency: "EUR",
    appliedAt: "2026-09-15",
    tags: [tags.frontend, tags.referral],
    interviews: [],
    cvGenerations: [
      {
        id: 31,
        status: "COMPLETED",
        format: "DOCX",
        requestedAt: "2026-09-14T17:40:00Z",
        completedAt: "2026-09-14T17:41:22Z",
        generatedCvVersion: 1,
        errorMessage: null,
      },
    ],
    generatedCvs: [
      {
        version: 1,
        format: "DOCX",
        filename: "alex-rivera-brightline-health-v1.docx",
        byteSize: 31_904,
        createdAt: "2026-09-14T17:41:22Z",
      },
    ],
  },
  {
    id: 4,
    company: "Northwind Labs",
    title: "Senior Frontend Engineer",
    status: "INTERVIEW",
    location: "Lisbon, Portugal",
    remoteType: "HYBRID",
    source: "LinkedIn",
    salaryMin: 55000,
    salaryMax: 68000,
    currency: "EUR",
    appliedAt: "2026-09-08",
    tags: [tags.frontend, tags.react],
    interviews: [
      {
        type: "Phone",
        scheduledAt: "2026-09-16T10:00:00Z",
        location: "Video call",
        outcome: "PASSED",
        notes: "Intro with the engineering manager.",
      },
      {
        type: "Technical",
        scheduledAt: "2026-10-02T14:30:00Z",
        location: "Lisbon office",
        outcome: "PENDING",
        notes: "Pairing session on a React component.",
      },
    ],
    cvGenerations: [
      {
        id: 43,
        status: "COMPLETED",
        format: "PDF",
        requestedAt: "2026-09-12T09:05:00Z",
        completedAt: "2026-09-12T09:06:14Z",
        generatedCvVersion: 2,
        errorMessage: null,
      },
      {
        id: 42,
        status: "FAILED",
        format: "PDF",
        requestedAt: "2026-09-12T08:51:00Z",
        completedAt: "2026-09-12T08:52:03Z",
        generatedCvVersion: null,
        errorMessage: "The drafting model was unavailable. No CV was saved.",
      },
      {
        id: 41,
        status: "COMPLETED",
        format: "DOCX",
        requestedAt: "2026-09-07T18:20:00Z",
        completedAt: "2026-09-07T18:21:31Z",
        generatedCvVersion: 1,
        errorMessage: null,
      },
    ],
    generatedCvs: [
      {
        version: 2,
        format: "PDF",
        filename: "alex-rivera-northwind-labs-v2.pdf",
        byteSize: 91_532,
        createdAt: "2026-09-12T09:06:14Z",
      },
      {
        version: 1,
        format: "DOCX",
        filename: "alex-rivera-northwind-labs-v1.docx",
        byteSize: 33_118,
        createdAt: "2026-09-07T18:21:31Z",
      },
    ],
  },
  {
    id: 5,
    company: "Harbor & Pine",
    title: "Product Engineer",
    status: "INTERVIEW",
    location: "Dublin, Ireland",
    remoteType: "REMOTE",
    source: "Job board",
    salaryMin: 60000,
    salaryMax: 70000,
    currency: "EUR",
    appliedAt: "2026-09-02",
    tags: [tags.react, tags.remote],
    interviews: [
      {
        type: "HR",
        scheduledAt: "2026-09-30T09:00:00Z",
        location: "Video call",
        outcome: "PENDING",
        notes: null,
      },
    ],
    cvGenerations: [],
    generatedCvs: [],
  },
  {
    id: 6,
    company: "Fernway Bank",
    title: "Frontend Platform Engineer",
    status: "OFFER",
    location: "Berlin, Germany",
    remoteType: "HYBRID",
    source: "Recruiter",
    salaryMin: 72000,
    salaryMax: 80000,
    currency: "EUR",
    appliedAt: "2026-08-18",
    tags: [tags.fintech, tags.frontend],
    interviews: [
      {
        type: "Final",
        scheduledAt: "2026-09-10T15:00:00Z",
        location: "Berlin office",
        outcome: "PASSED",
        notes: "Offer expected by the end of the month.",
      },
    ],
    cvGenerations: [
      {
        id: 61,
        status: "COMPLETED",
        format: "PDF",
        requestedAt: "2026-08-17T11:02:00Z",
        completedAt: "2026-08-17T11:03:05Z",
        generatedCvVersion: 1,
        errorMessage: null,
      },
    ],
    generatedCvs: [
      {
        version: 1,
        format: "PDF",
        filename: "alex-rivera-fernway-bank-v1.pdf",
        byteSize: 88_402,
        createdAt: "2026-08-17T11:03:05Z",
      },
    ],
  },
  {
    id: 7,
    company: "Lumen Atlas",
    title: "JavaScript Developer",
    status: "REJECTED",
    location: "Paris, France",
    remoteType: "ON_SITE",
    source: "Company website",
    salaryMin: null,
    salaryMax: null,
    currency: "EUR",
    appliedAt: "2026-08-25",
    tags: [tags.frontend],
    interviews: [
      {
        type: "Technical",
        scheduledAt: "2026-09-05T13:00:00Z",
        location: "Video call",
        outcome: "FAILED",
        notes: null,
      },
    ],
    cvGenerations: [],
    generatedCvs: [],
  },
  {
    id: 8,
    company: "Solstice Media",
    title: "Web Developer",
    status: "WITHDRAWN",
    location: "Barcelona, Spain",
    remoteType: "HYBRID",
    source: "Job board",
    salaryMin: 38000,
    salaryMax: 42000,
    currency: "EUR",
    appliedAt: "2026-08-20",
    tags: [],
    interviews: [],
    cvGenerations: [],
    generatedCvs: [],
  },
];

export type ItemIdsByStatus = Record<ApplicationStatus, number[]>;

export const initialItemIdsByStatus = (): ItemIdsByStatus =>
  Object.fromEntries(
    statusColumns.map(({ value }) => [
      value,
      demoApplications
        .filter((application) => application.status === value)
        .map((application) => application.id),
    ]),
  ) as ItemIdsByStatus;
