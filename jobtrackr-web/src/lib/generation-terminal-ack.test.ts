import { afterEach, describe, expect, it } from "vitest";

import {
	TERMINAL_GENERATION_ACK_STORAGE_KEY,
	acknowledgeLatestTerminalOutcome,
	acknowledgeTerminalCvGeneration,
	isTerminalCvGenerationAcknowledged,
} from "@/lib/generation-terminal-ack";

afterEach(() => {
	window.localStorage.clear();
});

describe("generation terminal ack", () => {
	it("stores acknowledgment keyed by Application and terminal CV Generation id", () => {
		expect(isTerminalCvGenerationAcknowledged(3, 10)).toBe(false);

		acknowledgeTerminalCvGeneration(3, 10);

		expect(isTerminalCvGenerationAcknowledged(3, 10)).toBe(true);
		expect(isTerminalCvGenerationAcknowledged(3, 11)).toBe(false);
		expect(isTerminalCvGenerationAcknowledged(9, 10)).toBe(false);
		expect(window.localStorage.getItem(TERMINAL_GENERATION_ACK_STORAGE_KEY)).toContain(
			'"3":10',
		);
	});

	it("lets a later terminal outcome remind again after a previous ack", () => {
		acknowledgeTerminalCvGeneration(3, 10);
		acknowledgeTerminalCvGeneration(3, 22);

		expect(isTerminalCvGenerationAcknowledged(3, 10)).toBe(false);
		expect(isTerminalCvGenerationAcknowledged(3, 22)).toBe(true);
	});

	it("acknowledgeLatestTerminalOutcome no-ops when there is no terminal outcome", () => {
		acknowledgeLatestTerminalOutcome(3, null);
		expect(isTerminalCvGenerationAcknowledged(3, 10)).toBe(false);
	});
});
