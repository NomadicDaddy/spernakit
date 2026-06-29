import { AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-react';

import type { SecurityHealthReport, SecurityHealthUser } from '@/api/types';

import { CardSkeleton } from '@/components/shared/skeletons/CardSkeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function SecurityHealthSection({
	data,
	isLoading,
}: {
	data: SecurityHealthReport | undefined;
	isLoading: boolean;
}) {
	if (isLoading) {
		return <CardSkeleton contentLines={4} titleWidth="h-6 w-48" />;
	}

	if (!data) return null;

	const report = data;

	const usersWithIssues = report.users.filter((u: SecurityHealthUser) => u.issues.length > 0);
	const totalIssues = usersWithIssues.reduce(
		(sum: number, u: SecurityHealthUser) => sum + u.issues.length,
		0
	);

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center gap-2">
					<ShieldAlert aria-hidden="true" className="h-5 w-5" />
					<CardTitle>Security Health</CardTitle>
				</div>
				<CardDescription>
					Security compliance overview across all user accounts
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center gap-3">
					{totalIssues === 0 ? (
						<>
							<CheckCircle aria-hidden="true" className="h-5 w-5 text-green-500" />
							<span className="text-sm font-medium">
								All {report.users.length} users are compliant
							</span>
						</>
					) : (
						<>
							<AlertTriangle aria-hidden="true" className="h-5 w-5 text-yellow-500" />
							<span className="text-sm font-medium">
								{usersWithIssues.length} of {report.users.length} users have issues
								({totalIssues} total)
							</span>
						</>
					)}
				</div>

				{usersWithIssues.length > 0 && (
					<div className="space-y-2">
						{usersWithIssues.map((user: SecurityHealthUser) => (
							<div
								className="flex items-center justify-between rounded-lg border p-3"
								key={user.id}>
								<div>
									<span className="text-sm font-medium">{user.username}</span>
									<span className="text-muted-foreground ml-2 text-xs">
										{user.email}
									</span>
								</div>
								<div className="flex gap-1">
									{user.issues.map((issue: string) => (
										<Badge key={issue} variant="destructive">
											{issue}
										</Badge>
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

export { SecurityHealthSection };
