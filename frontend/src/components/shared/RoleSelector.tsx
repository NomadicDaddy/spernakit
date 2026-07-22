import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

function defaultRoleLabel(role: string): string {
	return role.charAt(0) + role.slice(1).toLowerCase();
}

interface RoleSelectorProps {
	'aria-label'?: string;
	className?: string;
	id?: string;
	labelFn?: (role: string) => string;
	onValueChange: (role: string) => void;
	roles: readonly string[];
	value: string;
}

function RoleSelector({
	'aria-label': ariaLabel = 'Select role',
	className,
	id,
	labelFn = defaultRoleLabel,
	onValueChange,
	roles,
	value,
}: RoleSelectorProps) {
	return (
		<Select onValueChange={onValueChange} value={value}>
			<SelectTrigger aria-label={ariaLabel} className={className} id={id}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{roles.map((role) => (
					<SelectItem key={role} value={role}>
						{labelFn(role)}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export { RoleSelector };
