import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

const COPY_FEEDBACK_DURATION_MS = 2000;

function CopyButton({ value }: { value: string }) {
	const [copied, setCopied] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, []);

	function handleCopy() {
		void navigator.clipboard.writeText(value);
		setCopied(true);
		timeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
	}

	return (
		<Button aria-label="Copy to clipboard" onClick={handleCopy} size="icon" variant="ghost">
			{copied ? (
				<Check aria-hidden="true" className="h-4 w-4" />
			) : (
				<Copy aria-hidden="true" className="h-4 w-4" />
			)}
		</Button>
	);
}

export { CopyButton };
