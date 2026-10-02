import { TriangleAlert, FileText, LayoutDashboard, LogOut, User as UserIcon, X } from "lucide-react";
import { useContext, useRef, useState } from "react";
import { Form as RouterForm, Link, useLocation } from "react-router";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EntitlementContext } from "@/lib/entitlement";
import { ACCOUNT_MENU_BUTTON_LABEL, ACCOUNT_SETTINGS_PATH, isAccountSettingsLocation } from "@/lib/account-settings";
import type { User } from "@/types/user";
import { cn } from "@/lib/utils";

type NavbarProps = { user: User };

const tabs = [
	{ to: "/", label: "Kanban", Icon: LayoutDashboard },
	{ to: "/documents", label: "Documents", Icon: FileText },
] as const;

export function Navbar({ user }: NavbarProps) {
	const limitedAccess = useContext(EntitlementContext)?.access === "LIMITED";
	const [accessExplanationOpen, setAccessExplanationOpen] = useState(false);
	const accessPointerType = useRef("");
	const [openUserData, setOpenUserData] = useState(false);
	const location = useLocation();
	const isKanban = location.pathname === "/" || location.pathname.startsWith("/applications/");
	const displayName = user.userDisplayName ?? user.userEmail;
	const settingsAlreadyOpen = isAccountSettingsLocation(location);
	const settingsTo = settingsAlreadyOpen
		? ACCOUNT_SETTINGS_PATH
		: { pathname: location.pathname, search: location.search, hash: location.hash };

	return (
		<header className="mx-auto my-2 w-full max-w-5xl px-3 sm:my-3 sm:px-4">
			<div className="relative mx-auto w-fit max-w-full">
				{limitedAccess && (
					<TooltipProvider>
						<Tooltip open={accessExplanationOpen} onOpenChange={setAccessExplanationOpen}>
							<TooltipTrigger asChild>
								<span
									role="status"
									aria-label="Limited Access"
									tabIndex={0}
									onPointerDown={(event) => {
										accessPointerType.current = event.pointerType;
										// Keep Radix from closing the tooltip before a touch tap toggles it.
										if (event.pointerType === "touch") event.preventDefault();
									}}
									onClick={(event) => {
										if (accessPointerType.current !== "touch") return;
										event.preventDefault();
										setAccessExplanationOpen((open) => !open);
									}}
									className="absolute right-[calc(100%+0.5rem)] top-1/2 flex h-8 -translate-y-1/2 cursor-default items-center gap-1.5 rounded-md border border-amber-600/30 bg-amber-50 px-2 text-xs font-semibold text-amber-800 outline-none focus-visible:ring-2 focus-visible:ring-amber-600/50 sm:px-2.5 sm:text-sm"
								>
									<TriangleAlert size={16} aria-hidden="true" />
									<span className="sr-only md:not-sr-only md:whitespace-nowrap">Limited Access</span>
								</span>
							</TooltipTrigger>
							<TooltipContent side="bottom" align="start" className="max-w-[min(20rem,calc(100vw-2rem))] space-y-2 bg-amber-800 text-amber-50 [&_svg]:fill-amber-800 px-3 py-2.5 text-sm leading-relaxed">
								<p>Your existing Applications remain available to view and edit. You can also add Interviews, create and attach Tags, and preview saved Generated CVs.</p>
								<p>Creating new Applications, uploading Base CVs, and starting CV Generation require current paid access.</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				)}

				<nav aria-label="Main navigation" className="flex w-fit max-w-full items-center gap-1 rounded-xl border border-light-gray bg-off-white p-2 shadow-cool-light max-[360px]:gap-0.5 max-[360px]:p-1">
					<div className="relative">
						<Button type="button" size="icon-sm" onClick={() => setOpenUserData(!openUserData)} variant="ghost" className="text-medium-gray hover:bg-light-accent hover:text-darkest-accent" aria-label={ACCOUNT_MENU_BUTTON_LABEL} aria-expanded={openUserData}>
							<UserIcon />
						</Button>
						{openUserData && (
							<div className="fixed left-4 top-14 z-30 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-y-3 rounded-lg border border-light-gray bg-off-white px-4 py-3 shadow-cool-light sm:absolute sm:left-0 sm:top-10">
								<Button type="button" onClick={() => setOpenUserData(false)} variant="ghost" className="absolute right-2 top-2 h-7 w-7 rounded-lg p-1" aria-label="Close account menu"><X size={16} /></Button>
								<dl className="flex flex-col gap-y-3">
									<div className="pr-8"><dt className="text-sm text-medium-gray">Name</dt><dd className="truncate font-medium">{displayName}</dd></div>
									<div><dt className="text-sm text-medium-gray">Primary Email</dt><dd className="truncate font-medium">{user.userEmail}</dd></div>
								</dl>
								<Link
									to={settingsTo}
									mask={settingsAlreadyOpen ? undefined : ACCOUNT_SETTINGS_PATH}
									onClick={() => setOpenUserData(false)}
									className="text-sm font-medium text-darkest-accent underline"
								>
									Settings
								</Link>
							</div>
						)}
					</div>

					<span aria-hidden="true" className="px-0.5 text-light-gray max-[360px]:px-0">|</span>

					<ul className="flex items-center gap-1">
						{tabs.map(({ to, label, Icon }) => {
							const active = to === "/" ? isKanban : location.pathname === to || location.pathname.startsWith(`${to}/`);
							return (
								<li key={to}>
									<Link to={to} aria-label={label} aria-current={active ? "page" : undefined} className={cn("flex h-8 items-center gap-2 rounded-md px-2.5 text-medium-gray transition-colors hover:bg-light-accent hover:text-darkest-accent sm:px-3 max-[360px]:px-1.5", active && "bg-light-accent font-semibold text-darkest-accent")}>
										<Icon size={19} aria-hidden="true" /><span className="hidden sm:inline">{label}</span>
									</Link>
								</li>
							);
						})}
					</ul>

					<span aria-hidden="true" className="px-0.5 text-light-gray max-[360px]:px-0">|</span>

					<RouterForm method="post" action="/">
						<input type="hidden" name="intent" value="logout" />
						<Button type="submit" size="icon-sm" variant="ghost" className="text-medium-gray hover:bg-light-accent hover:text-darkest-accent" aria-label="Log out"><LogOut /></Button>
					</RouterForm>
				</nav>
			</div>
		</header>
	);
}
