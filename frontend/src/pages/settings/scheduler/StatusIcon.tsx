import type { ScheduledTaskStatus } from 'spernakit-shared';

import { CheckCircle, Clock, XCircle } from 'lucide-react';

function StatusIcon({ status }: { status: ScheduledTaskStatus }) {
	if (status === 'completed')
		return <CheckCircle aria-hidden="true" className="size-4 text-green-500" />;
	if (status === 'running') return <Clock aria-hidden="true" className="size-4 text-blue-500" />;
	return <XCircle aria-hidden="true" className="size-4 text-red-500" />;
}

export { StatusIcon };
