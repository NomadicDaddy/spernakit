import { useQuery } from '@tanstack/react-query';
import { Key, Plus } from 'lucide-react';
import { useState } from 'react';

import type { ApiKey } from '@/api/types';

import { listApiKeys } from '@/api/apiKeys';
import { EmptyState } from '@/components/shared/EmptyState';
import { CardSkeleton } from '@/components/shared/skeletons/CardSkeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/stores/authStore';

import { ApiKeyCard, CreateApiKeyDialog, RevokeApiKeyDialog } from './api-keys';

function ApiKeysTab() {
	const userId = useAuthStore((s) => s.user?.id ?? 0);

	const [showCreate, setShowCreate] = useState(false);
	const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);

	const { data, isLoading } = useQuery({
		enabled: userId > 0,
		queryFn: () => listApiKeys(userId),
		queryKey: ['api-keys', userId],
	});

	const keys = data?.data ?? [];

	if (isLoading) {
		return <CardSkeleton contentLines={2} descriptionWidth="h-4 w-64" titleWidth="h-6 w-32" />;
	}

	return (
		<>
			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					{/*
					 * `space-y-1` and a `text-base` title, matching the dashboard cards that use
					 * this same header-with-trailing-action pattern. The header override turns the
					 * card's own grid into a flex row, which drops the `gap-2` that normally
					 * separates the title from its description — they rendered welded together at
					 * a 0px gap, with the title at the same 14px as the muted line beneath it.
					 */}
					<div className="space-y-1">
						<CardTitle>API Keys</CardTitle>
						<CardDescription>Manage API keys for programmatic access</CardDescription>
					</div>
					<Button onClick={() => setShowCreate(true)} size="sm">
						<Plus aria-hidden="true" className="h-4 w-4" />
						Generate Key
					</Button>
				</CardHeader>
				<CardContent>
					{keys.length === 0 ? (
						/*
						 * The shared EmptyState, not a hand-rolled stack. The inline version put its
						 * title and its description at the same size, weight and colour, so the
						 * block had no internal hierarchy at all — and /files and /dashboard show
						 * the tinted icon tile and dashed panel for exactly this situation.
						 */
						<EmptyState
							action={
								<Button onClick={() => setShowCreate(true)} size="sm">
									<Plus aria-hidden="true" className="size-4" />
									Generate Key
								</Button>
							}
							description="Generate a key to access the API programmatically."
							headingLevel="h3"
							icon={Key}
							title="No API keys yet"
						/>
					) : (
						<div className="space-y-3">
							{keys.map((key) => (
								<ApiKeyCard key={key.id} keyItem={key} onRevoke={setRevokeTarget} />
							))}
						</div>
					)}
				</CardContent>
			</Card>

			<CreateApiKeyDialog
				onClose={() => setShowCreate(false)}
				open={showCreate}
				userId={userId}
			/>

			<RevokeApiKeyDialog
				onClose={() => setRevokeTarget(null)}
				target={revokeTarget}
				userId={userId}
			/>
		</>
	);
}

export { ApiKeysTab };
