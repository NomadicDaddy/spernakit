import { Check, Keyboard, LogOut, Monitor, Moon, Settings2, Sun, User } from 'lucide-react';
import { startTransition } from 'react';
import { Link } from 'react-router-dom';

import type { ThemeMode } from '@/stores/themeStore';

import { updateUserUiSettings } from '@/api/userSettings';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';

/**
 * Props for UserMenu component.
 */
interface UserMenuProps {
	onLogout: () => Promise<void>;
}

const themeModes: { icon: React.ReactNode; label: string; value: ThemeMode }[] = [
	{ icon: <Sun aria-hidden="true" className="mr-2 size-4" />, label: 'Light', value: 'light' },
	{ icon: <Moon aria-hidden="true" className="mr-2 size-4" />, label: 'Dark', value: 'dark' },
	{
		icon: <Monitor aria-hidden="true" className="mr-2 size-4" />,
		label: 'System',
		value: 'system',
	},
];

/**
 * User menu dropdown component.
 *
 * Contains user info, navigation to account/preferences, theme selection,
 * keyboard shortcuts access, and sign-out.
 */
export function UserMenu({ onLogout }: UserMenuProps) {
	const user = useAuthStore((s) => s.user);
	const { mode, setMode } = useTheme();

	const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : '??';

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					aria-label="User menu"
					className="relative size-8 rounded-full"
					variant="ghost">
					<Avatar className="size-8">
						<AvatarFallback>{initials}</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-52">
				<DropdownMenuLabel>
					<div className="flex flex-col space-y-1">
						<p className="text-sm font-medium">{user?.username}</p>
						<p className="text-muted-foreground text-xs">{user?.email}</p>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link to="/profile/personal">
						<User aria-hidden="true" className="mr-2 size-4" />
						Account
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<Link to="/profile/preferences">
						<Settings2 aria-hidden="true" className="mr-2 size-4" />
						Preferences
					</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						{themeModes.find((t) => t.value === mode)?.icon ?? (
							<Monitor aria-hidden="true" className="mr-2 size-4" />
						)}
						Theme
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent>
						{themeModes.map((t) => (
							<DropdownMenuItem
								key={t.value}
								onClick={() => {
									startTransition(() => {
										setMode(t.value);
										updateUserUiSettings({ theme: t.value }).catch(
											() => undefined
										);
									});
								}}>
								{t.icon}
								{t.label}
								{mode === t.value && (
									<Check aria-hidden="true" className="ml-auto size-4" />
								)}
							</DropdownMenuItem>
						))}
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<DropdownMenuItem
					onClick={() => {
						window.dispatchEvent(new Event('shortcuts-help:open'));
					}}>
					<Keyboard aria-hidden="true" className="mr-2 size-4" />
					Keyboard Shortcuts
					<span className="text-muted-foreground ml-auto text-xs">?</span>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={() => {
						void onLogout();
					}}>
					<LogOut aria-hidden="true" className="mr-2 size-4" />
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
