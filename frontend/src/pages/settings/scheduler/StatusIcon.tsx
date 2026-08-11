import type { ScheduledTaskStatus } from 'spernakit-shared';

import { CheckCircle, Clock, XCircle } from 'lucide-react';

function StatusIcon({ status }: { status: ScheduledTaskStatus }) {
	if (status === 'completed')
		return <CheckCircle aria-hidden="true" className="size-4 text-success" />;
	if (status === 'running') return <Clock aria-hidden="true" className="size-4 text-primary" />;
	return <XCircle aria-hidden="true" className="size-4 text-destructive" />;
}

export { StatusIcon };
