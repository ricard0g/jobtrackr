/** Client-only ack for Kanban success/failed reminders after opening Generate. */
export const TERMINAL_GENERATION_ACK_STORAGE_KEY =
	"jobtrackr:cv-generation-terminal-ack:v1";

type AckMap = Record<string, number>;

const ackKey = (applicationId: number) => String(applicationId);

const readAckMap = (): AckMap => {
	try {
		const raw = window.localStorage.getItem(TERMINAL_GENERATION_ACK_STORAGE_KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		const result: AckMap = {};
		for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
			if (typeof value === "number" && Number.isInteger(value) && value > 0) {
				result[key] = value;
			}
		}
		return result;
	} catch {
		return {};
	}
};

const writeAckMap = (map: AckMap) => {
	try {
		window.localStorage.setItem(
			TERMINAL_GENERATION_ACK_STORAGE_KEY,
			JSON.stringify(map),
		);
	} catch {
		// Ack is best-effort UI chrome; private mode should not break Generate.
	}
};

export function isTerminalCvGenerationAcknowledged(
	applicationId: number,
	cvGenerationId: number,
): boolean {
	return readAckMap()[ackKey(applicationId)] === cvGenerationId;
}

export function acknowledgeTerminalCvGeneration(
	applicationId: number,
	cvGenerationId: number,
): void {
	const map = readAckMap();
	map[ackKey(applicationId)] = cvGenerationId;
	writeAckMap(map);
}

/** Acknowledge the latest COMPLETED/FAILED outcome for an Application, if any. */
export function acknowledgeLatestTerminalOutcome(
	applicationId: number,
	terminalOutcome: { cvGenerationId: number } | null | undefined,
): void {
	if (!terminalOutcome) return;
	acknowledgeTerminalCvGeneration(applicationId, terminalOutcome.cvGenerationId);
}
