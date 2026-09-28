import type { UserRole } from '@/types/roles';

/**
 * The lowest role that may enter the settings area. The `/settings` route guard, the Settings nav
 * entry and the command palette's settings entries all read it, so an app that raises the floor
 * raises it everywhere at once instead of leaving a surface offering pages its users cannot open.
 * A settings tab with a `minRole` of its own narrows further; one without inherits this.
 */
const SETTINGS_AREA_MIN_ROLE: UserRole = 'ADMIN';

export { SETTINGS_AREA_MIN_ROLE };
