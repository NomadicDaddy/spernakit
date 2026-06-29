import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import type { NavItem } from '@/components/layout/navConfig';

import { registerShortcut } from '@/hooks/useKeyboardShortcuts';

import { ShellNavBase } from './ShellNavBase';

type BbsNavProps = {
	navItems: NavItem[];
};

function renderBbsLabel(_item: NavItem, index: number) {
	return (
		<>
			<span className="text-primary">[{index + 1}]</span> {_item.label.toUpperCase()}
		</>
	);
}

function BbsNav({ navItems }: BbsNavProps) {
	const navigate = useNavigate();

	useEffect(() => {
		const cleanups = navItems.map((item, index) =>
			registerShortcut({
				description: `Navigate to ${item.label}`,
				handler: () => void navigate(item.to),
				key: String(index + 1),
				label: String(index + 1),
			})
		);
		return () => cleanups.forEach((cleanup) => cleanup());
	}, [navItems, navigate]);

	return (
		<ShellNavBase
			navItems={navItems}
			renderLabel={renderBbsLabel}
			sheetTitle="=== MAIN MENU ==="
		/>
	);
}

export { BbsNav };
