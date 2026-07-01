import type { NavItem } from '@/components/layout/navConfig';

import { ShellNavBase } from './ShellNavBase';

type TerminalNavProps = {
	navItems: NavItem[];
};

function renderTerminalLabel(item: NavItem) {
	return (
		<>
			{'> '}
			{item.label.toLowerCase()}
		</>
	);
}

function TerminalNav({ navItems }: TerminalNavProps) {
	return (
		<ShellNavBase
			navItems={navItems}
			renderLabel={renderTerminalLabel}
			sheetTitle="navigation"
		/>
	);
}

export { TerminalNav };
