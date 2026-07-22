import { useQuery } from '@tanstack/react-query';
import { Key, Plus } from 'lucide-react';
import { useState } from 'react';

import type { ApiKey } from '@/api/types';

import { listApiKeys } from '@/api/apiKeys';
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
					<div>
						<CardTitle>API Keys</CardTitle>
						<CardDescription>Manage API keys for programmatic access</CardDescription>
					</div>
					<Button onClick={() => setShowCreate(true)} size="sm">
						<Plus aria-hidden="true" className="mr-2 h-4 w-4" />
						Generate Key
					</Button>
				</CardHeader>
				<CardContent>
					{keys.length === 0 ? (
						<div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center">
							<Key aria-hidden="true" className="h-8 w-8" />
							<p>No API keys yet</p>
							<p className="text-sm">
								Generate a key to access the API programmatically
							</p>
						</div>
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
