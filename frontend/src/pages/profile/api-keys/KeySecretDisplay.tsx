import { Download } from 'lucide-react';

import type { ApiKeyCreateResponse } from '@/api/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { CopyButton } from '../CopyButton';

function downloadCredentials(result: ApiKeyCreateResponse) {
	const lines = [
		`# ${result.keyData.keyName}`,
		`# Generated: ${new Date(result.keyData.createdAt).toISOString()}`,
		`# Scope: ${result.keyData.keyScope}`,
		'',
		`API_KEY=${result.apiKey}`,
		`API_SECRET=${result.apiKeySecret}`,
		'',
	];
	const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `${result.keyData.keyName.replaceAll(/[^a-zA-Z0-9_-]/g, '_')}-credentials.txt`;
	a.click();
	setTimeout(() => {
		URL.revokeObjectURL(url);
	}, 100);
}

function KeySecretDisplay({ result }: { result: ApiKeyCreateResponse }) {
	return (
		<div className="space-y-4">
			<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3 text-sm">
				Store these values securely. They will not be shown again.
			</div>
			<div className="space-y-2">
				<Label htmlFor="api-key">API Key</Label>
				<div className="flex items-center gap-2">
					<Input
						className="font-mono text-xs"
						id="api-key"
						readOnly
						value={result.apiKey}
					/>
					<CopyButton value={result.apiKey} />
				</div>
			</div>
			<div className="space-y-2">
				<Label htmlFor="api-secret">API Secret</Label>
				<div className="flex items-center gap-2">
					<Input
						className="font-mono text-xs"
						id="api-secret"
						readOnly
						value={result.apiKeySecret}
					/>
					<CopyButton value={result.apiKeySecret} />
				</div>
			</div>
			<Button
				className="w-full"
				onClick={() => downloadCredentials(result)}
				variant="outline">
				<Download aria-hidden="true" className="mr-2 size-4" />
				Download Credentials
			</Button>
			<div className="bg-muted/30 text-muted-foreground space-y-2 rounded-md border p-3 text-xs">
				<p className="font-medium">Usage</p>
				<p>
					Simple mode — send the key in the{' '}
					<code className="bg-muted rounded px-1 py-0.5 font-mono" translate="no">
						X-API-Key
					</code>{' '}
					header on any authenticated endpoint:
				</p>
				<pre className="bg-muted/50 overflow-x-auto rounded p-2 font-mono" translate="no">
					curl -H &quot;X-API-Key: {result.apiKey.slice(0, 8)}...&quot;
					{' \\\n'}
					{'  '}$API_BASE_URL/users
				</pre>
				<p>
					HMAC mode — additionally send{' '}
					<code className="bg-muted rounded px-1 py-0.5 font-mono" translate="no">
						X-API-Signature
					</code>
					,{' '}
					<code className="bg-muted rounded px-1 py-0.5 font-mono" translate="no">
						X-API-Timestamp
					</code>
					, and{' '}
					<code className="bg-muted rounded px-1 py-0.5 font-mono" translate="no">
						X-API-Nonce
					</code>{' '}
					computed from the API Secret.
				</p>
				<p className="text-muted-foreground/80">
					These user-minted keys are distinct from the app-level{' '}
					<code className="bg-muted rounded px-1 py-0.5 font-mono" translate="no">
						security.applicationApiKey
					</code>{' '}
					in config.spernakit.json.
				</p>
			</div>
		</div>
	);
}

export { KeySecretDisplay };
