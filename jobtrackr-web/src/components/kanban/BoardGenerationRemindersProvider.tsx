import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
	type ReactNode,
} from "react";

import {
	resolveBoardGenerationSignifier,
	type BoardGenerationReminder,
	type BoardGenerationSignifier,
	type BoardTerminalOutcome,
} from "@/lib/board-generation-reminders";
import {
	acknowledgeLatestTerminalOutcome,
	isTerminalCvGenerationAcknowledged,
} from "@/lib/generation-terminal-ack";

type BoardGenerationRemindersContextValue = {
	signifierFor: (applicationId: number) => BoardGenerationSignifier | null;
	acknowledgeTerminal: (
		applicationId: number,
		terminalOutcome: BoardTerminalOutcome | null | undefined,
	) => void;
};

const BoardGenerationRemindersContext =
	createContext<BoardGenerationRemindersContextValue | null>(null);

export function BoardGenerationRemindersProvider({
	reminders,
	children,
}: {
	reminders: BoardGenerationReminder[];
	children: ReactNode;
}) {
	const [ackRevision, setAckRevision] = useState(0);

	const remindersByApplicationId = useMemo(() => {
		const map: Record<number, BoardGenerationReminder> = {};
		for (const reminder of reminders) {
			map[reminder.applicationId] = reminder;
		}
		return map;
	}, [reminders]);

	const signifierFor = useCallback(
		(applicationId: number): BoardGenerationSignifier | null => {
			void ackRevision;
			const reminder = remindersByApplicationId[applicationId];
			return resolveBoardGenerationSignifier(reminder, (cvGenerationId) =>
				isTerminalCvGenerationAcknowledged(applicationId, cvGenerationId),
			);
		},
		[ackRevision, remindersByApplicationId],
	);

	const acknowledgeTerminal = useCallback(
		(
			applicationId: number,
			terminalOutcome: BoardTerminalOutcome | null | undefined,
		) => {
			if (!terminalOutcome) return;
			if (
				isTerminalCvGenerationAcknowledged(
					applicationId,
					terminalOutcome.cvGenerationId,
				)
			) {
				return;
			}
			acknowledgeLatestTerminalOutcome(applicationId, terminalOutcome);
			setAckRevision((revision) => revision + 1);
		},
		[],
	);

	const value = useMemo(
		() => ({
			signifierFor,
			acknowledgeTerminal,
		}),
		[signifierFor, acknowledgeTerminal],
	);

	return (
		<BoardGenerationRemindersContext.Provider value={value}>
			{children}
		</BoardGenerationRemindersContext.Provider>
	);
}

export function useBoardGenerationReminders() {
	const value = useContext(BoardGenerationRemindersContext);
	if (!value) {
		throw new Error(
			"useBoardGenerationReminders must be used within BoardGenerationRemindersProvider",
		);
	}
	return value;
}

/** Optional access for surfaces that may mount outside the board (tests). */
export function useOptionalBoardGenerationReminders() {
	return useContext(BoardGenerationRemindersContext);
}
