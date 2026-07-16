import { FileText, LayoutDashboard, LogOut, Sparkles, User as UserIcon, X } from "lucide-react";
import { useState } from "react";
import { Form as RouterForm, Link, useLocation } from "react-router";

import { Button } from "@/components/ui/button";
import type { User } from "@/types/user";
import { cn } from "@/lib/utils";

type NavbarProps = { user: User };

const tabs = [
	{ to: "/", label: "Kanban", Icon: LayoutDashboard },
	{ to: "/documents", label: "Documents", Icon: FileText },
	{ to: "/generate", label: "Generate", Icon: Sparkles },
] as const;

export function Navbar({ user }: NavbarProps) {
	const [openUserData, setOpenUserData] = useState(false);
	const location = useLocation();
	const isKanban = location.pathname === "/" || location.pathname.startsWith("/applications/");
	const displayName = user.userDisplayName ?? user.userEmail;

	return (
		<header className="mx-auto my-2 w-full max-w-5xl px-3 sm:my-3 sm:px-4">
			<nav aria-label="Main navigation" className="mx-auto flex w-fit max-w-full items-center gap-1 rounded-xl border border-light-gray bg-off-white p-2 shadow-cool-light">
				<div className="relative">
					<Button type="button" size="icon-sm" onClick={() => setOpenUserData(!openUserData)} variant="ghost" className="text-medium-gray hover:bg-light-accent hover:text-darkest-accent" aria-label="Open account menu" aria-expanded={openUserData}>
						<UserIcon />
					</Button>
					{openUserData && (
						<dl className="fixed left-4 top-14 z-30 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-y-3 rounded-lg border border-light-gray bg-off-white px-4 py-3 shadow-cool-light sm:absolute sm:left-0 sm:top-10">
							<Button type="button" onClick={() => setOpenUserData(false)} variant="ghost" className="absolute right-2 top-2 h-7 w-7 rounded-lg p-1" aria-label="Close account menu"><X size={16} /></Button>
							<div className="pr-8"><dt className="text-sm text-medium-gray">Name</dt><dd className="truncate font-medium">{displayName}</dd></div>
							<div><dt className="text-sm text-medium-gray">Email</dt><dd className="truncate font-medium">{user.userEmail}</dd></div>
						</dl>
					)}
				</div>

				<span aria-hidden="true" className="px-0.5 text-light-gray">|</span>

				<ul className="flex items-center gap-1">
					{tabs.map(({ to, label, Icon }) => {
						const active = to === "/" ? isKanban : location.pathname === to || location.pathname.startsWith(`${to}/`);
						return (
							<li key={to}>
								<Link to={to} aria-label={label} aria-current={active ? "page" : undefined} className={cn("flex h-8 items-center gap-2 rounded-md px-2.5 text-medium-gray transition-colors hover:bg-light-accent hover:text-darkest-accent sm:px-3", active && "bg-light-accent font-semibold text-darkest-accent")}>
									<Icon size={19} aria-hidden="true" /><span className="hidden sm:inline">{label}</span>
								</Link>
							</li>
						);
					})}
				</ul>

				<span aria-hidden="true" className="px-0.5 text-light-gray">|</span>

				<RouterForm method="post" action="/">
					<input type="hidden" name="intent" value="logout" />
					<Button type="submit" size="icon-sm" variant="ghost" className="text-medium-gray hover:bg-light-accent hover:text-darkest-accent" aria-label="Log out"><LogOut /></Button>
				</RouterForm>
			</nav>
		</header>
	);
}
