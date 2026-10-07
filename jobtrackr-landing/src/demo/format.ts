import type { DemoApplication, RemoteType } from "./demo-data";

// Fixed locale and time zone keep server-rendered and hydrated text identical.
const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export const formatDate = (date: string | null) =>
  date ? dateFormat.format(new Date(date)) : "Not specified";

export const formatDateTime = (date: string) =>
  dateTimeFormat.format(new Date(date));

const formatSalaryValue = (value: number | null) =>
  value === null ? null : `${Math.round(value / 1000)}k`;

export const formatSalaryRange = (
  application: DemoApplication,
  fallback: string,
) => {
  const min = formatSalaryValue(application.salaryMin);
  const max = formatSalaryValue(application.salaryMax);

  if (min && max) return `${application.currency} ${min} - ${max}`;
  if (min) return `From ${application.currency} ${min}`;
  if (max) return `Up to ${application.currency} ${max}`;

  return fallback;
};

export const remoteTypeLabels: Record<RemoteType, string> = {
  ON_SITE: "On-site",
  HYBRID: "Hybrid",
  REMOTE: "Remote",
};

export const formatBytes = (bytes: number) => `${Math.round(bytes / 1024)} KB`;
