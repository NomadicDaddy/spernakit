import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { registerShortcut } from '@/hooks/useKeyboardShortcuts';
import { useCommandStore } from '@/stores/commandStore';

const NAV_SHORTCUTS = [
	{ description: 'Go to Home', key: 'g d', label: 'g d', path: '/dashboard' },
	{ description: 'Go to Settings', key: 'g s', label: 'g s', path: '/settings' },
	{ description: 'Go to Account', key: 'g a', label: 'g a', path: '/profile/personal' },
] as const;

function useAppShellShortcuts(): void {
	const navigate = useNavigate();
	const toggleCommandPalette = useCommandStore((s) => s.toggle);

	useEffect(() => {
		const cleanups = [
			registerShortcut({
				description: 'Open command palette',
				handler: toggleCommandPalette,
				key: 'mod+k',
				label: 'Ctrl+K',
			}),
			registerShortcut({
				description: 'Show keyboard shortcuts',
				handler: () => window.dispatchEvent(new Event('shortcuts-help:open')),
				key: '?',
				label: '?',
			}),
			...NAV_SHORTCUTS.map((s) =>
				registerShortcut({
					description: s.description,
					handler: () => void navigate(s.path),
					key: s.key,
					label: s.label,
				})
			),
		];

		return () => {
			for (const cleanup of cleanups) {
				cleanup();
			}
		};
	}, [navigate, toggleCommandPalette]);
}

export { useAppShellShortcuts };
