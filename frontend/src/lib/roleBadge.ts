import type { UserRole } from '@/types/roles';

/**
 * The badge variant a role is drawn in, everywhere a role is shown.
 *
 * Role is identity, not state, and badge.tsx states the rule this map exists to keep: identity and
 * metadata use `outline` or `secondary`, they do not borrow the state colours, and `bg-primary` is
 * reserved for things you click. Three vocabularies had grown up against that rule — /settings/roles
 * drew SYSOP `destructive` and ADMIN `default`, so red and saturated blue were the two loudest marks
 * on a surface with no state and no clickable element, while /settings/users drew the same SYSOP
 * grey one tab away. badge.tsx's own doc comment names the outcome: "That is how red came to mean
 * SYSOP."
 *
 * The split is privileged (`secondary`, filled) against unprivileged (`outline`). It deliberately
 * does not encode the tier: five roles do not need five colours when the label and the adjacent
 * "Level N" already carry the ordering, and a fifth hue would have to come from the state palette.
 *
 * One map, so a role cannot look like two different things on two surfaces.
 */
const roleBadgeVariant: Record<UserRole, 'outline' | 'secondary'> = {
	ADMIN: 'secondary',
	MANAGER: 'outline',
	OPERATOR: 'outline',
	SYSOP: 'secondary',
	VIEWER: 'outline',
};

export { roleBadgeVariant };
