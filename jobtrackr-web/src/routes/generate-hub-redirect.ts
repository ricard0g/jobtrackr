import { redirect } from "react-router";

/** Old Generate hub URLs land on the Kanban root; CV Generation lives on Application Generate. */
export function generateHubRedirectLoader() {
	return redirect("/");
}
