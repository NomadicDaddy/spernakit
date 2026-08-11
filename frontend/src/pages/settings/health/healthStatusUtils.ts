import type { VariantProps } from 'class-variance-authority';

import type { badgeVariants } from '@/components/ui/badge';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

/**
 * Health status maps onto the shared Badge state variants rather than raw palette utilities, so
 * "healthy" here is the same green as "completed" on /settings/scheduled-tasks and the same green
 * the glyph inside the badge inherits.
 */
export function statusBadgeVariant(status: string): BadgeVariant {
	if (status === 'healthy') return 'success';
	if (status === 'degraded') return 'warning';
	return 'destructive';
}
