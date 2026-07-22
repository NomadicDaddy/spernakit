import { Input } from '@/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { useAuthorization } from '@/hooks/useAuthorization';
import { ROLES } from '@/types/roles';

interface UserTableFiltersProps {
	onRoleFilterChange: (value: string) => void;
	onSearchChange: (value: string) => void;
	roleFilter: string;
	search: string;
}

export function UserTableFilters({
	onRoleFilterChange,
	onSearchChange,
	roleFilter,
	search,
}: UserTableFiltersProps) {
	const { roleLabel } = useAuthorization();

	return (
		<div className="flex items-center gap-2">
			<Input
				aria-label="Search users"
				className="max-w-sm"
				onChange={(e) => {
					onSearchChange(e.target.value);
				}}
				placeholder="Search users…"
				value={search}
			/>
			<Select
				onValueChange={(value) => {
					onRoleFilterChange(value === 'all' ? '' : value);
				}}
				value={roleFilter || 'all'}>
				<SelectTrigger aria-label="Filter by role" className="w-[140px]">
					<SelectValue placeholder="All roles" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All roles</SelectItem>
					{ROLES.map((role) => (
						<SelectItem key={role} value={role}>
							{roleLabel(role)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
