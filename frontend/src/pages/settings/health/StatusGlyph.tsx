import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

/**
 * The glyph for a health status, written the way `StatusIcon` on /settings/scheduled-tasks is.
 *
 * It carries no colour and no size of its own because it is meant to be rendered *inside* the
 * status Badge, where `[&>svg]:size-3` sizes it and the badge variant colours it. It used to be a
 * standalone coloured `size-4` element drawn *beside* that badge — two marks saying one thing in
 * one colour, on eleven rows of a surface whose palette otherwise reserves colour for exceptions.
 *
 * It lives in its own file rather than beside `statusBadgeVariant` so that module can stay a plain
 * helper module; a file that exports both a component and a function loses fast refresh.
 */
function StatusGlyph({ status }: { status: string }) {
	if (status === 'healthy') return <CheckCircle aria-hidden="true" />;
	if (status === 'degraded') return <AlertTriangle aria-hidden="true" />;
	return <XCircle aria-hidden="true" />;
}

export { StatusGlyph };
