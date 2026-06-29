import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useDeferredValue, useState } from 'react';

import type { User } from '@/api/types';

import { listUsers } from '@/api/users';
import { Button } from '@/components/ui/button';
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/** Maximum number of candidate users returned to the picker at once. */
const USER_PICKER_LIMIT = 20;

interface UserPickerProps {
	existingMemberIds: Set<number>;
	onSelect: (user: null | User) => void;
	selectedUser: null | User;
}

function UserPicker({ existingMemberIds, onSelect, selectedUser }: UserPickerProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const deferredSearch = useDeferredValue(search);

	const { data, isFetching } = useQuery({
		queryFn: () =>
			listUsers({
				limit: String(USER_PICKER_LIMIT),
				page: '1',
				...(deferredSearch.trim() !== '' ? { search: deferredSearch.trim() } : {}),
			}),
		queryKey: ['users', 'picker', deferredSearch.trim()],
		staleTime: 30_000,
	});

	const candidateUsers = (data?.data ?? []).filter((u) => !existingMemberIds.has(u.id));

	return (
		<Popover modal onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					aria-expanded={open}
					className="flex-1 justify-between"
					role="combobox"
					variant="outline">
					{selectedUser
						? `${selectedUser.username} (${selectedUser.email})`
						: 'Select a user…'}
					<ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-(--radix-popover-trigger-width) min-w-[280px] p-0">
				<Command shouldFilter={false}>
					<CommandInput
						aria-label="Search users"
						onValueChange={setSearch}
						placeholder="Search by username or email…"
						value={search}
					/>
					<CommandList>
						{isFetching && candidateUsers.length === 0 ? (
							<div className="text-muted-foreground py-6 text-center text-sm">
								Loading…
							</div>
						) : candidateUsers.length === 0 ? (
							<CommandEmpty>
								{search.trim() === ''
									? 'Type to search users'
									: 'No matching users available'}
							</CommandEmpty>
						) : (
							<CommandGroup>
								{candidateUsers.map((user) => (
									<CommandItem
										key={user.id}
										onSelect={() => {
											onSelect(user);
											setOpen(false);
										}}
										value={`${user.username}-${user.email}-${user.id}`}>
										<Check
											className={cn(
												'mr-2 size-4',
												selectedUser?.id === user.id
													? 'opacity-100'
													: 'opacity-0'
											)}
										/>
										<div className="flex flex-col">
											<span className="font-medium">{user.username}</span>
											<span className="text-muted-foreground text-xs">
												{user.email}
											</span>
										</div>
									</CommandItem>
								))}
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

export { UserPicker };
