import { LogOut, User as UserIcon, X } from "lucide-react";
import { useState } from "react";
import { Form as RouterForm } from "react-router";

import { CreatePostulationDialog } from "@/components/postulations/CreatePostulationDialog";
import { Button } from "@/components/ui/button";
import { useBoard } from "@/components/kanban/useBoard";

export function Navbar() {
	const [openUserData, setOpenUserData] = useState(false);
	const { allApplications, user } = useBoard();
	const displayName = user.userDisplayName ?? user.userEmail;

	return (
		<header className="mx-auto my-4 w-full max-w-4xl px-4">
			<nav className="w-full rounded-lg border border-light-gray bg-off-white px-4 py-2 shadow-cool-light">
				<ul className="flex w-full items-center justify-between gap-4">
					<li className="relative flex min-w-0 items-center gap-x-2 text-dark-gray">
						<Button
							type="button"
							onClick={() => setOpenUserData(!openUserData)}
							variant="ghost"
							className="rounded-lg p-2 hover:bg-light-gray"
							aria-label="Open user menu"
						>
							<UserIcon />
						</Button>
						<span className="truncate">Bienvenido {displayName}</span>
						{openUserData && (
							<dl className="absolute left-0 top-14 z-20 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-y-2 rounded-lg border border-light-gray bg-off-white px-4 py-3 shadow-cool-light">
								<Button
									type="button"
									onClick={() => setOpenUserData(false)}
									variant="ghost"
									className="absolute right-2 top-2 h-7 w-7 rounded-lg p-1 hover:bg-light-gray"
									aria-label="Close user menu"
								>
									<X size={16} />
								</Button>

								<div className="w-full pr-8">
									<dt className="text-sm text-medium-gray">Nombre</dt>
									<dd className="truncate font-medium">{displayName}</dd>
								</div>

								<div className="w-full">
									<dt className="text-sm text-medium-gray">Correo Electronico</dt>
									<dd className="truncate font-medium">{user.userEmail}</dd>
								</div>
							</dl>
						)}
					</li>
					<li className="flex items-center gap-2">
						<CreatePostulationDialog applications={allApplications} />
						<RouterForm method="post">
							<input type="hidden" name="intent" value="logout" />
							<Button type="submit" variant="ghost" aria-label="Log out">
								<LogOut />
							</Button>
						</RouterForm>
					</li>
				</ul>
			</nav>
		</header>
	);
}
