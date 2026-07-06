import { isRouteErrorResponse, useRouteError } from "react-router";

import { Button } from "@/components/ui/button";

export default function RootErrorBoundary() {
	const error = useRouteError();
	const status = isRouteErrorResponse(error) ? error.status : 500;
	const message = isRouteErrorResponse(error)
		? error.statusText
		: error instanceof Error
			? error.message
			: "Unexpected error";

	return (
		<main className="flex min-h-screen items-center justify-center bg-off-white p-6">
			<section className="w-full max-w-md rounded-lg border border-light-gray bg-white p-6 shadow-cool-light">
				<p className="text-sm font-medium text-medium-gray">Error {status}</p>
				<h1 className="mt-2 font-display text-2xl font-bold text-dark-gray">
					Something went wrong
				</h1>
				<p className="mt-2 text-sm text-medium-gray">{message}</p>
				<Button className="mt-5" onClick={() => window.location.assign("/")}>
					Return to app
				</Button>
			</section>
		</main>
	);
}
