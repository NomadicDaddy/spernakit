import { Building2, Edit, Settings, Trash2, Users } from 'lucide-react';

import type { Workspace } from '@/api/types';

import { Button } from '@/components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';

interface WorkspaceListProps {
	isLoading: boolean;
	onDeleteWorkspace: (id: number, name: string) => void;
	onEditWorkspace: (workspace: { description: null | string; id: number; name: string }) => void;
	onManageMembers: (id: number) => void;
	onWorkspaceSettings: (id: number) => void;
	workspaces: Workspace[];
}

export function WorkspaceList({
	isLoading,
	onDeleteWorkspace,
	onEditWorkspace,
	onManageMembers,
	onWorkspaceSettings,
	workspaces,
}: WorkspaceListProps) {
	const { user } = useAuth();
	const { can } = useAuthorization();

	return (
		<>
			{isLoading ? (
				<div className="flex justify-center py-8">
					<div className="text-muted-foreground text-sm">Loading workspaces…</div>
				</div>
			) : workspaces.length === 0 ? (
				<div className="rounded-lg border p-8 text-center">
					<Building2
						aria-hidden="true"
						className="text-muted-foreground mx-auto mb-4 h-12 w-12"
					/>
					<h2 className="mb-2 text-lg font-semibold">No workspaces found</h2>
					<p className="text-muted-foreground text-sm">
						{can('ADMIN')
							? 'Create a workspace to get started.'
							: 'You are not a member of any workspace.'}
					</p>
				</div>
			) : (
				<div className="rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Description</TableHead>
								<TableHead>Owner</TableHead>
								<TableHead>Default</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{workspaces.map((workspace) => (
								<TableRow key={workspace.id}>
									<TableCell className="font-medium">{workspace.name}</TableCell>
									<TableCell className="text-muted-foreground">
										{workspace.description ?? '-'}
									</TableCell>
									<TableCell>
										{workspace.ownerId === user?.id
											? 'You'
											: (workspace.ownerUsername ?? '—')}
									</TableCell>
									<TableCell>{workspace.isDefault ? 'Yes' : 'No'}</TableCell>
									<TableCell className="text-right">
										<div className="flex justify-end gap-2">
											<Button
												aria-label="Manage Members"
												className="h-8 px-3"
												onClick={() => onManageMembers(workspace.id)}
												title="Manage Members"
												variant="outline">
												<Users className="h-4 w-4" />
												{can('MANAGER') && (
													<span className="ml-2">Members</span>
												)}
											</Button>
											{can('MANAGER') && (
												<Button
													aria-label="Settings"
													className="h-8 px-3"
													onClick={() =>
														onWorkspaceSettings(workspace.id)
													}
													title="Settings"
													variant="outline">
													<Settings className="h-4 w-4" />
													<span className="ml-2">Settings</span>
												</Button>
											)}
											{workspace.ownerId === user?.id && can('ADMIN') && (
												<>
													<Button
														aria-label="Edit workspace"
														className="h-8 w-8 p-0"
														onClick={() => onEditWorkspace(workspace)}
														title="Edit"
														variant="ghost">
														<Edit className="h-4 w-4" />
													</Button>
													<Button
														aria-label="Delete workspace"
														className="text-destructive h-8 w-8 p-0"
														onClick={() =>
															onDeleteWorkspace(
																workspace.id,
																workspace.name
															)
														}
														title="Delete"
														variant="ghost">
														<Trash2 className="h-4 w-4" />
													</Button>
												</>
											)}
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</>
	);
}
