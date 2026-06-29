import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Crown, Eye, Settings, Shield, ShieldCheck, Users } from 'lucide-react';

import type { PaginatedResponse, User, UserRole } from '@/api/types';

import { listUsers } from '@/api/users';
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
			<div>
				<h2 className="text-lg font-semibold">Roles &amp; Hierarchy</h2>
				<p className="text-muted-foreground text-sm">
					5-tier hierarchical role system. Higher roles inherit all lower role
					permissions.
				</p>
			</div>

			{/* Hierarchy visualization */}
			<div className="flex flex-wrap items-center gap-2 text-sm">
				{ROLE_DEFINITIONS.map((def, idx) => {
					const label = roleLabels?.[def.role]?.label ?? def.label;
					return (
						<span className="flex items-center gap-2" key={def.role}>
							<Badge variant={def.variant}>{label}</Badge>
							<span className="text-muted-foreground font-mono text-xs">
								(Level {def.level})
							</span>
							{idx < ROLE_DEFINITIONS.length - 1 && (
								<ChevronDown
									aria-hidden="true"
									className="text-muted-foreground -rotate-90"
									size={16}
								/>
							)}
						</span>
					);
				})}
			</div>

			{/* Role cards */}
			<div className="grid gap-4">
				{ROLE_DEFINITIONS.map((def) => {
					const Icon = def.icon;
					const count = roleCounts[def.role];
					const label = roleLabels?.[def.role]?.label ?? def.label;
					const description = roleLabels?.[def.role]?.description ?? def.description;

					return (
						<Card key={def.role}>
							<CardHeader className="pb-3">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
											<Icon aria-hidden="true" size={20} />
										</div>
										<div>
											<CardTitle className="flex items-center gap-2 text-base">
												{label}
												<Badge variant={def.variant}>{def.role}</Badge>
												<span className="text-muted-foreground text-xs font-normal">
													Level {def.level}
												</span>
											</CardTitle>
											<CardDescription>{description}</CardDescription>
										</div>
									</div>
									<div className="text-right">
										{isLoading ? (
											<Skeleton className="h-6 w-16" />
										) : (
											<span className="text-muted-foreground text-sm">
												<Shield
													aria-hidden="true"
													className="mr-1 inline-block"
													size={14}
												/>
												{count} {count === 1 ? 'user' : 'users'}
											</span>
										)}
									</div>
								</div>
							</CardHeader>
							<CardContent>
								<div className="text-sm">
									<p className="text-muted-foreground mb-2 font-medium">
										Permissions:
									</p>
									<ul className="text-muted-foreground grid gap-1 sm:grid-cols-2">
										{def.permissions.map((perm) => (
											<li className="flex items-start gap-2" key={perm}>
												<span className="text-primary mt-1">&#x2022;</span>
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
