import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useDeferredValue, useId, useState } from 'react';

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
	/**
	 * Id of the element that names this picker — usually the field's visible `Label`.
	 *
	 * `<Label htmlFor>` cannot do the job alone. The trigger is a `<button>`, so a label
	 * pointed at it replaces its text as the accessible name — and that text is where the
	 * current selection lives, so the control would announce "User" and never say who is
	 * selected. Naming it from the label AND its own caption gives
	 * "User username (email@address)", the shape `FileUpload` already uses for its drop
	 * zone. The call site that prompted this pointed `htmlFor` at an id nothing rendered,
	 * so the label named nothing at all and the picker was left with whatever its caption
	 * happened to say.
	 */
	labelledBy?: string;
	onSelect: (user: null | User) => void;
	selectedUser: null | User;
}

function UserPicker({ existingMemberIds, labelledBy, onSelect, selectedUser }: UserPickerProps) {
	const [open, setOpen] = useState(false);
	const captionId = useId();
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
				{/*
				 * `min-w-0` because `flex-1` alone does not let this shrink: a flex item keeps
				 * `min-width: auto`, which resolves to min-content, and Button is `whitespace-nowrap`
				 * — so the trigger held a hard 167px floor and, with a selection made, the floor grew
				 * to the width of "username (email@address)". `truncate` on the label is what the
				 * shrink then costs, and it costs nothing the popover does not show in full.
				 */}
				<Button
					aria-expanded={open}
					aria-labelledby={labelledBy ? `${labelledBy} ${captionId}` : undefined}
					className="min-w-0 flex-1 justify-between"
					role="combobox"
					variant="outline">
					<span className="truncate" id={captionId}>
						{selectedUser
							? `${selectedUser.username} (${selectedUser.email})`
							: 'Select a user…'}
					</span>
					{/* No `ml-2`: Button already sets `gap-2`, and this is the last of the
					    doubled icon margins on the workspace surface. */}
					<ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 opacity-50" />
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
							<div className="py-6 text-center text-sm text-muted-foreground">
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
												'size-4',
												selectedUser?.id === user.id
													? 'opacity-100'
													: 'opacity-0',
											)}
										/>
										<div className="flex flex-col">
											<span className="font-medium">{user.username}</span>
											<span className="text-xs text-muted-foreground">
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
