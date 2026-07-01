import { Building2, Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWorkspace } from '@/hooks/useWorkspace';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/stores/sidebarStore';

/** Dropdown for switching between the user's available workspaces. */
function WorkspaceSwitcher() {
	const { activeWorkspace, activeWorkspaceId, switchWorkspace, workspaces } = useWorkspace();
	const collapsed = useSidebarStore((s) => s.collapsed);

	if (workspaces.length <= 1) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					className={cn('w-full justify-start gap-2', collapsed && 'justify-center px-2')}
					size="sm"
					variant="outline">
					<Building2 aria-hidden="true" className="size-4 shrink-0" />
					{!collapsed && (
						<>
							<span className="min-w-0 truncate">
								{activeWorkspace?.name ?? 'Select workspace'}
							</span>
							<ChevronsUpDown
								aria-hidden="true"
								className="ml-auto size-4 shrink-0 opacity-50"
							/>
						</>
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				{workspaces.map((ws) => (
					<DropdownMenuItem key={ws.id} onClick={() => switchWorkspace(ws.id)}>
						<Check
							aria-hidden="true"
							className={cn(
								'mr-2 size-4',
								ws.id === activeWorkspaceId ? 'opacity-100' : 'opacity-0'
							)}
						/>
						<span className="min-w-0 truncate">{ws.name}</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export { WorkspaceSwitcher };
