import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Crown, Eye, Settings, Shield, ShieldCheck, Users } from 'lucide-react';

import type { PaginatedResponse, User, UserRole } from '@/api/types';

import { listUsers } from '@/api/users';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthorization } from '@/hooks/useAuthorization';

interface RoleDefinition {
	description: string;
	icon: typeof Crown;
	label: string;
	level: number;
	permissions: string[];
	role: UserRole;
	variant: 'default' | 'destructive' | 'outline' | 'secondary';
}

const ROLE_DEFINITIONS: RoleDefinition[] = [
	{
		description:
			'Full system access. Cross-workspace visibility. Bypasses workspace isolation.',
		icon: Crown,
		label: 'System Operator',
		level: 5,
		permissions: [
			'All ADMIN permissions',
			'Cross-workspace access',
			'Bypass workspace isolation',
			'System configuration',
			'View all audit logs',
		],
		role: 'SYSOP',
		variant: 'destructive',
	},
	{
		description: 'Application administration. User management and system settings.',
		icon: ShieldCheck,
		label: 'Administrator',
		level: 4,
		permissions: [
			'All MANAGER permissions',
			'Create and manage users',
			'Update application settings',
			'View audit logs',
			'Manage workspaces',
			'Broadcast notifications',
		],
		role: 'ADMIN',
		variant: 'default',
	},
	{
		description: 'Team and workspace member management.',
		icon: Users,
		label: 'Manager',
		level: 3,
		permissions: [
			'All OPERATOR permissions',
			'Manage workspace members',
			'Assign roles within workspace',
		],
		role: 'MANAGER',
		variant: 'secondary',
	},
	{
		description: 'Standard operations including data entry and modification.',
		icon: Settings,
		label: 'Operator',
		level: 2,
		permissions: [
			'All VIEWER permissions',
			'Create and edit records',
			'Upload files',
			'View system health details',
			'View settings',
		],
		role: 'OPERATOR',
		variant: 'outline',
	},
	{
		description: 'Read-only access to permitted resources.',
		icon: Eye,
		label: 'Viewer',
		level: 1,
		permissions: [
			'View dashboard',
			'View own notifications',
			'Update own profile',
			'Read workspace data',
		],
		role: 'VIEWER',
		variant: 'outline',
	},
];

function RolesTab() {
	const { user: authUser } = useAuthorization();
	const roleLabels = authUser?.roleLabels;
	const { data, isLoading } = useQuery<PaginatedResponse<User>>({
		queryFn: () => listUsers({ limit: '100', page: '1' }),
		queryKey: ['users', 'role-counts'],
	});

	const roleCounts: Record<UserRole, number> = {
		ADMIN: 0,
		MANAGER: 0,
		OPERATOR: 0,
		SYSOP: 0,
		VIEWER: 0,
	};

	if (data?.data) {
		for (const user of data.data) {
			if (user.role in roleCounts) {
				roleCounts[user.role]++;
			}
		}
	}

	return (
		<div className="space-y-6">
			{/*
			 * The last hand-rolled tab heading on the settings rail. `text-lg font-semibold` is the
			 * app's h3 step used in an h2 slot, so this tab's title rendered 18px while Audit Logs,
			 * Scheduled Tasks and System Health — reached by the same tab strip — rendered theirs
			 * through `SectionHeader` at `text-h3`, with a different margin under the description.
			 */}
			<SectionHeader
				description="5-tier hierarchical role system. Higher roles inherit all lower role permissions."
				title="Roles & Hierarchy"
			/>

			{/* Hierarchy visualization */}
			<div className="flex flex-wrap items-center gap-2 text-sm">
				{ROLE_DEFINITIONS.map((def, idx) => {
					const label = roleLabels?.[def.role]?.label ?? def.label;
					return (
						<span className="flex items-center gap-2" key={def.role}>
							<Badge variant={def.variant}>{label}</Badge>
							<span className="font-mono text-xs text-muted-foreground">
								(Level {def.level})
							</span>
							{idx < ROLE_DEFINITIONS.length - 1 && (
								<ChevronDown
									aria-hidden="true"
									className="-rotate-90 text-muted-foreground"
									size={16}
								/>
							)}
						</span>
					);
				})}
			</div>

			{/*
			 * Role cards. This was the only multi-card group in the app that never declared
			 * columns, so five static reference cards stacked one per row and the Viewer card sat
			 * below the fold at every viewport from 1024 up to 2250.
			 */}
			<div className="grid gap-4 xl:grid-cols-2">
				{ROLE_DEFINITIONS.map((def) => {
					const Icon = def.icon;
					const count = roleCounts[def.role];
					const label = roleLabels?.[def.role]?.label ?? def.label;
					const description = roleLabels?.[def.role]?.description ?? def.description;

					return (
						<Card key={def.role}>
							<CardHeader className="pb-3">
								{/*
								 * The user count is the only queried datum here — everything else
								 * is the static ROLE_DEFINITIONS constant — and it used to sit
								 * alone in a right-aligned slot ~990px from the role it counts.
								 * In the title cluster it reads as part of the subject, and
								 * `tabular-nums` is what the app uses for every other count.
								 */}
								<div className="flex items-center gap-3">
									<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-primary">
										<Icon aria-hidden="true" className="size-5" />
									</div>
									<div className="min-w-0">
										<CardTitle
											as="h3"
											className="flex flex-wrap items-center gap-2">
											{label}
											<Badge variant={def.variant}>{def.role}</Badge>
											<span className="text-xs font-normal text-muted-foreground">
												Level {def.level}
											</span>
											{isLoading ? (
												<Skeleton className="h-4 w-16" />
											) : (
												<span className="inline-flex items-center gap-1 text-sm font-normal text-muted-foreground tabular-nums">
													<Shield
														aria-hidden="true"
														className="size-3.5"
													/>
													{count} {count === 1 ? 'user' : 'users'}
												</span>
											)}
										</CardTitle>
										<CardDescription>{description}</CardDescription>
									</div>
								</div>
							</CardHeader>
							<CardContent>
								<div className="text-sm">
									<p className="mb-2 font-medium text-muted-foreground">
										Permissions:
									</p>
									{/*
									 * Native list markers rather than a hand-rolled `<span>&bull;</span>`,
									 * which had no `aria-hidden` (22 spurious "bullet" announcements)
									 * and painted `--primary` — the app's action colour — on inert
									 * decoration on a surface with no actions. `list-disc` sits on the
									 * `li` so each marker hangs inside its own grid track.
									 *
									 * Track counts step back down at `xl`, where the cards themselves
									 * become two-up: a half-width card cannot carry four columns.
									 */}
									<ul className="grid gap-1 text-muted-foreground sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
										{def.permissions.map((perm) => (
											<li
												className="ml-4 list-disc marker:text-muted-foreground"
												key={perm}>
												{perm}
											</li>
										))}
									</ul>
								</div>
							</CardContent>
						</Card>
					);
				})}
			</div>
		</div>
	);
}

export { RolesTab };
