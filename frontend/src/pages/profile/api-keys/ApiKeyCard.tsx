import { Trash2 } from 'lucide-react';

import type { ApiKey, ApiKeyScope } from '@/api/types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFormatters } from '@/hooks/useFormatters';

function scopeBadgeVariant(scope: ApiKeyScope) {
	switch (scope) {
		case 'admin':
			return 'destructive' as const;
		case 'write':
			return 'default' as const;
		default:
			return 'secondary' as const;
	}
}

interface ApiKeyCardProps {
	keyItem: ApiKey;
	onRevoke: (key: ApiKey) => void;
}

function ApiKeyCard({ keyItem, onRevoke }: ApiKeyCardProps) {
	const { formatDate } = useFormatters();
	return (
		<div className="flex items-center justify-between rounded-lg border p-4">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="font-medium">{keyItem.keyName}</span>
					<Badge variant={scopeBadgeVariant(keyItem.keyScope)}>{keyItem.keyScope}</Badge>
					{!keyItem.isActive && <Badge variant="outline">Revoked</Badge>}
				</div>
				<div className="text-muted-foreground mt-1 text-xs">
					Created {formatDate(keyItem.createdAt)}
					{keyItem.lastUsedAt && (
						<> &middot; Last used {formatDate(keyItem.lastUsedAt)}</>
					)}
					{keyItem.expiresAt && <> &middot; Expires {formatDate(keyItem.expiresAt)}</>}
				</div>
			</div>
			{keyItem.isActive && (
				<Button
					aria-label="Revoke API key"
					onClick={() => onRevoke(keyItem)}
					size="icon"
					variant="ghost">
					<Trash2 className="h-4 w-4" />
				</Button>
			)}
		</div>
	);
}

export { ApiKeyCard };
