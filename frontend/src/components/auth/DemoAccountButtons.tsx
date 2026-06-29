import type { RefObject } from 'react';

import { User } from 'lucide-react';

import type { DemoAccount } from '@/api/demo';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { fillDemoCredentials } from '@/lib/demoAccount';

function DemoAccountButtons({
	accounts,
	formRef,
	onDemoSelect,
	passwordRef,
	usernameRef,
}: {
	accounts: DemoAccount[];
	formRef: RefObject<HTMLFormElement | null>;
	onDemoSelect: () => void;
	passwordRef: RefObject<HTMLInputElement | null>;
	usernameRef: RefObject<HTMLInputElement | null>;
}) {
	if (accounts.length === 0) return null;

	return (
		<>
			<div className="relative my-4">
				<Separator />
				<span className="bg-card text-muted-foreground absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-2 text-xs">
					Demo Accounts (Dev Only)
				</span>
			</div>
			<div className="space-y-2">
				<p className="text-muted-foreground text-center text-xs">
					Quick login with demo accounts (passwords auto-filled)
				</p>
				{accounts.map((account) => (
					<Button
						className="w-full justify-start gap-2"
						key={account.username}
						onClick={() => {
							onDemoSelect();
							if (usernameRef.current && passwordRef.current) {
								fillDemoCredentials(
									usernameRef.current,
									passwordRef.current,
									account.username,
									account.password
								);
								formRef.current?.requestSubmit();
							}
						}}
						variant="outline">
						<User aria-hidden="true" className="size-4" />
						<div className="flex flex-col items-start">
							<span className="text-sm font-medium">{account.username}</span>
							<span className="text-muted-foreground text-xs">{account.role}</span>
						</div>
					</Button>
				))}
			</div>
		</>
	);
}

export { DemoAccountButtons };
