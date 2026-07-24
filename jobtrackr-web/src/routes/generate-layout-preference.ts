export type PreparingLayout = "list" | "grid";

/** Versioned key so invalid legacy values fall back to List without migration code. */
export const PREPARING_LAYOUT_STORAGE_KEY = "jobtrackr:generate-preparing-layout:v1";

export const isPreparingLayout = (value: unknown): value is PreparingLayout =>
	value === "list" || value === "grid";

export const readPreparingLayoutPreference = (): PreparingLayout => {
	try {
		const raw = window.localStorage.getItem(PREPARING_LAYOUT_STORAGE_KEY);
		if (isPreparingLayout(raw)) return raw;
	} catch {
		// Private mode / blocked storage — treat as missing preference.
	}
	return "list";
};

export const writePreparingLayoutPreference = (layout: PreparingLayout): void => {
	try {
		window.localStorage.setItem(PREPARING_LAYOUT_STORAGE_KEY, layout);
	} catch {
		// Preference is best-effort; UI still updates for the current visit.
	}
};
