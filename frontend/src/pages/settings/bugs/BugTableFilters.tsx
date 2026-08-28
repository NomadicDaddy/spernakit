import { BUG_REPORT_STATUSES } from 'spernakit-shared';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

import { KIND_LABEL, KINDS, STATUS_LABEL } from './bugMeta';

interface BugTableFiltersProps {
	includeSuperseded: boolean;
	kind: string;
	onIncludeSupersededChange: (checked: boolean) => void;
	onKindChange: (value: string) => void;
	onSearchChange: (value: string) => void;
	onStatusChange: (value: string) => void;
	search: string;
	status: string;
}

/**
 * Search, status, kind and superseded filters for the submissions table.
 *
 * All four go to the server, so the pagination total counts the filtered set. The description
 * search used to be a `searchColumn`, which is a client-side TanStack filter: against a
 * server-paginated list it hid rows from the current page of twenty while the footer went on
 * reporting the server's unfiltered total, so the table read "No results." above "Showing 1-2 of
 * 2". Same geometry as `UserTableFilters`.
 */
function BugTableFilters({
	includeSuperseded,
	kind,
	onIncludeSupersededChange,
	onKindChange,
	onSearchChange,
	onStatusChange,
	search,
	status,
}: BugTableFiltersProps) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Input
				aria-label="Search submissions"
				autoComplete="off"
				className="max-w-sm"
				onChange={(e) => {
					onSearchChange(e.target.value);
				}}
				placeholder="Search submissions…"
				value={search}
			/>
			<Select onValueChange={onStatusChange} value={status}>
				<SelectTrigger aria-label="Filter by status" className="w-[140px]">
					<SelectValue placeholder="All statuses" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All statuses</SelectItem>
					{BUG_REPORT_STATUSES.map((value) => (
						<SelectItem key={value} value={value}>
							{STATUS_LABEL[value]}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select onValueChange={onKindChange} value={kind}>
				<SelectTrigger aria-label="Filter by kind" className="w-[140px]">
					<SelectValue placeholder="All kinds" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All kinds</SelectItem>
					{KINDS.map((value) => (
						<SelectItem key={value} value={value}>
							{KIND_LABEL[value]}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{/*
			  A switch rather than a fourth status value, because superseded is not a status: a
			  report that was replaced still has one, and a triager filtering for Open wants the
			  open reports that are still current. Same control the data viewer uses to show rows
			  it hides by default.
			*/}
			<div className="flex items-center gap-2">
				<Switch
					aria-label="Show superseded reports"
					checked={includeSuperseded}
					id="include-superseded"
					onCheckedChange={onIncludeSupersededChange}
				/>
				<Label className="text-sm" htmlFor="include-superseded">
					Show superseded
				</Label>
			</div>
		</div>
	);
}

export { BugTableFilters };
