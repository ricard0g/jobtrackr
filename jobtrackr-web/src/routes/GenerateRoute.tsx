import { Sparkles } from "lucide-react";

export function GenerateRoute() {
	return (
		<section className="mx-auto flex h-full max-w-3xl items-center justify-center px-4 pb-20 text-center">
			<div className="rounded-2xl border border-light-gray bg-off-white p-10 shadow-cool-light">
				<Sparkles className="mx-auto mb-4 text-dark-accent" size={40} />
				<h1 className="text-3xl font-bold text-darkest-accent">Generate is coming soon</h1>
				<p className="mt-3 text-medium-gray">Soon you will be able to select a Base CV for each application and generate tailored documents.</p>
			</div>
		</section>
	);
}
