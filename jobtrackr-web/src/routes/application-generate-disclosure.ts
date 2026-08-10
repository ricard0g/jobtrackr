export type GenerateFormDisclosure = {
	defaultExpanded: boolean;
	label: "Generate CV" | "Generate another";
	canSubmit: boolean;
};

export function getGenerateFormDisclosure({
	hasActiveGeneration,
	generatedCvCount,
}: {
	hasActiveGeneration: boolean;
	generatedCvCount: number;
}): GenerateFormDisclosure {
	const idle = !hasActiveGeneration;
	const empty = generatedCvCount === 0;

	return {
		defaultExpanded: idle && empty,
		label: empty ? "Generate CV" : "Generate another",
		canSubmit: idle,
	};
}
