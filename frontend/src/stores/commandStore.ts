import { create } from 'zustand';

/** State and actions for the Ctrl+K command palette dialog. */
interface CommandState {
	close: () => void;
	isOpen: boolean;
	open: () => void;
	toggle: () => void;
}

const useCommandStore = create<CommandState>()((set) => ({
	close: () => {
		set({ isOpen: false });
	},
	isOpen: false,
	open: () => {
		set({ isOpen: true });
	},
	toggle: () => {
		set((state) => ({ isOpen: !state.isOpen }));
	},
}));

export { useCommandStore };
