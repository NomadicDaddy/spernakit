# Frontend - Spernakit v3

The React-based frontend application for Spernakit v3.

## Overview

This frontend provides:

- **Modern React 19** with TypeScript
- **shadcn/ui** component library (Radix UI primitives)
- **TanStack Query** for server state management
- **Zustand** for client state management
- **React Router v7** for navigation
- **Real-time** WebSocket integration
- **Code splitting** with lazy loading
- **Web Vitals** reporting

## Tech Stack

| Category     | Technology                 |
| ------------ | -------------------------- |
| Framework    | React 19 + TypeScript      |
| Build        | Vite 7                     |
| Styling      | Tailwind CSS 4 + shadcn/ui |
| Server State | TanStack Query v5          |
| Client State | Zustand                    |
| Routing      | React Router v7            |
| Icons        | Lucide React               |
| Toasts       | sonner (via shadcn/ui)     |
| Forms        | Native (controlled inputs) |
| Tables       | TanStack Table v8          |
| Metrics      | web-vitals                 |

## Directory Structure

```
frontend/src/
├── main.tsx              # Application entry point
├── App.tsx               # Root component with providers
├── routes.tsx            # Route configuration with lazy loading
├── tailwind.css          # Tailwind CSS styles and theme
├── api/                  # API client layer (summary; full list is larger)
│   ├── client.ts         # Base API client with error handling
│   ├── types.ts          # API type definitions
│   ├── auth.ts           # Authentication API
│   ├── users.ts          # User management API
│   ├── notifications.ts  # Notifications API
│   ├── workspaces.ts     # Workspace API
│   ├── audit.ts          # Audit logs API
│   ├── health.ts         # Health check API
│   ├── tasks.ts          # Scheduled tasks API
│   └── ...               # Additional API modules (files, dashboards, etc.)
├── components/
│   ├── auth/             # Authentication components
│   │   ├── AuthFooterLink.tsx
│   │   ├── AuthFormError.tsx
│   │   ├── AuthPageLayout.tsx
│   │   ├── AuthStatusMessage.tsx
│   │   ├── DemoAccountButtons.tsx
│   │   ├── OAuthProviderButtons.tsx
│   │   └── ProtectedRoute.tsx
│   ├── layout/           # Layout components
│   │   ├── AppShell.tsx         # Main application shell
│   │   ├── BugReportButton.tsx  # Bug report button
│   │   ├── CommandPalette.tsx   # Ctrl+K command palette
│   │   ├── Header.tsx           # Top header bar
│   │   ├── MobileNav.tsx        # Mobile navigation drawer
│   │   ├── NotificationBell.tsx # Notification bell
│   │   ├── ShortcutsHelp.tsx    # Keyboard shortcuts help
│   │   ├── Sidebar.tsx          # Side navigation
│   │   ├── SkipLink.tsx         # Accessibility skip link
│   │   ├── TabLayout.tsx        # Tab-based layout
│   │   ├── TopBar.tsx           # Top bar component
│   │   ├── UserMenu.tsx         # User dropdown menu
│   │   └── navConfig.tsx        # Navigation configuration
│   ├── shared/           # Shared components
│   │   ├── ConfirmAlertDialog.tsx     # Confirmation dialog
│   │   ├── CopyButton.tsx             # Copy-to-clipboard button
│   │   ├── ErrorBoundary.tsx          # Error boundary wrapper
│   │   ├── FileUpload.tsx             # File upload component
│   │   ├── FormInputDialog.tsx        # Form input dialog
│   │   ├── PasswordStrengthIndicator.tsx # Password strength meter
│   │   ├── RoleSelector.tsx           # Role selection dropdown
│   │   ├── SettingsToggleRow.tsx       # Settings toggle row
│   │   ├── VirtualList.tsx            # Virtualized list
│   │   ├── WorkspaceFormFields.tsx    # Workspace form fields
│   │   ├── charts/                    # Chart components
│   │   │   ├── MetricChart.tsx        # Time-series area chart
│   │   │   ├── StatCard.tsx           # Statistics card
│   │   │   └── TimeRangeSelector.tsx  # Time range picker
│   │   ├── data-table/               # Data table components
│   │   │   ├── DataTable.tsx          # Reusable data table
│   │   │   ├── DataTablePagination.tsx
│   │   │   └── DataTableToolbar.tsx
│   │   └── skeletons/                 # Loading skeletons
│   │       ├── CardSkeleton.tsx
│   │       ├── ChartSkeleton.tsx
│   │       ├── ContentListSkeleton.tsx
│   │       ├── DashboardCardSkeleton.tsx
│   │       ├── StatCardSkeleton.tsx
│   │       └── TableSkeleton.tsx
│   ├── ui/               # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── table.tsx
│   │   ├── tabs.tsx
│   │   └── ... (25+ components)
│   └── workspace/        # Workspace components
│       └── WorkspaceSwitcher.tsx
├── hooks/                # Custom React hooks
│   ├── dashboards/       # Dashboard hooks
│   ├── files/            # File management hooks
│   ├── layout/           # Layout hooks
│   ├── notifications/    # Notification hooks
│   ├── profile/          # Profile hooks
│   ├── settings/         # Settings hooks
│   ├── useAuth.ts        # Authentication hook
│   ├── useAuthorization.ts # Role-based access hook
│   ├── useKeyboardShortcuts.ts # Keyboard shortcuts
│   ├── useNotificationSocket.ts # Real-time notifications
│   ├── useTheme.ts       # Theme management
│   ├── useWebSocket.ts   # WebSocket connection
│   └── useWorkspace.ts   # Workspace context
├── lib/                  # Utility libraries
│   ├── bugReport.ts      # Bug report utilities
│   ├── chartConstants.ts # Chart configuration constants
│   ├── debouncedStorage.ts # Debounced localStorage
│   ├── storageKeys.ts    # Versioned storage keys
│   ├── themes.ts         # Theme definitions
│   ├── utils.ts          # General utilities (cn, etc.)
│   ├── websocket/        # WebSocket client
│   │   ├── manager.ts    # WebSocket connection manager
│   │   ├── dispatcher.ts # Event dispatcher
│   │   ├── constants.ts  # WebSocket constants
│   │   ├── types.ts      # WebSocket types
│   │   ├── utils.ts      # WebSocket utilities
│   │   └── index.ts      # Barrel export
│   └── ...               # Additional utilities
├── pages/                # Page components
│   ├── analytics/        # Analytics pages
│   ├── auth/
│   │   ├── LoginPage.tsx
│   │   ├── ResetPasswordPage.tsx
│   │   ├── ResetPasswordConfirmPage.tsx
│   │   └── OAuthCallbackPage.tsx
│   ├── dashboard/
│   │   └── DashboardPage.tsx
│   ├── dashboards/       # Custom dashboards
│   ├── files/            # File management
│   ├── notifications/
│   │   └── NotificationsPage.tsx
│   ├── onboarding/       # Onboarding flow
│   ├── profile/
│   │   ├── ProfileLayout.tsx
│   │   ├── PersonalInfoTab.tsx
│   │   └── PreferencesTab.tsx
│   ├── settings/
│   │   ├── SettingsLayout.tsx
│   │   ├── ApplicationTab.tsx
│   │   ├── AuthenticationTab.tsx
│   │   ├── EmailTab.tsx
│   │   ├── NotificationSettingsTab.tsx
│   │   ├── UsersTab.tsx
│   │   ├── RolesTab.tsx
│   │   ├── AuditLogsTab.tsx
│   │   ├── SystemHealthTab.tsx
│   │   └── ScheduledTasksTab.tsx
│   ├── workspaces/       # Workspace management
│   └── NotFoundPage.tsx
├── stores/               # Zustand state stores
│   ├── authStore.ts      # Authentication state
│   ├── commandStore.ts   # Command palette state
│   ├── layoutStore.ts    # Layout preferences
│   ├── sidebarStore.ts   # Sidebar collapse state
│   ├── themeStore.ts     # Theme preferences
│   ├── workspaceStore.ts # Active workspace
│   └── wsStore.ts        # WebSocket connection state
└── types/                # TypeScript type definitions
    └── roles.ts          # Role hierarchy and types
```

## Getting Started

### Prerequisites

- Bun 1.3.10+ installed
- Root dependencies installed (`bun install` from project root)
- Backend running (for API calls)

### Running Locally

```bash
# From project root
bun run dev:frontend

# Or from frontend directory
bun run dev
```

The app will be available at `http://localhost:3330`.

### Available Scripts

| Script              | Description                      |
| ------------------- | -------------------------------- |
| `bun run dev`       | Start dev server with hot reload |
| `bun run build`     | Build for production             |
| `bun run typecheck` | Type check without emitting      |
| `bun run lint`      | Run ESLint                       |
| `bun run lint:fix`  | Fix ESLint issues                |
| `bun run test`      | Run tests (when implemented)     |

## Architecture Patterns

### State Management

**Server State (TanStack Query)**:

- Used for API data that lives on the server
- Provides caching, background refetching, optimistic updates
- Query keys follow pattern: `[domain, id?, filters?]`

```typescript
// Example: Using TanStack Query
const { data, isLoading } = useQuery({
	queryKey: ['users'],
	queryFn: () => userApi.list(),
});
```

**Client State (Zustand)**:

- Used for UI state, preferences, session data
- Stores have persist middleware for localStorage
- Uses debounced storage to avoid blocking

```typescript
// Example: Using Zustand store
const { isOpen, toggle } = useSidebarStore();
```

### Adding a New Page

1. Create page component in `pages/`:

```typescript
// pages/my-feature/MyPage.tsx
import { PageHeader } from '@/components/shared/PageHeader';

export function MyPage() {
	return (
		<div className="space-y-6">
			<PageHeader title="My Feature" description="Description here" />
			{/* Content */}
		</div>
	);
}
```

2. Add lazy import in `routes.tsx`:

```typescript
const MyPage = lazy(() => import('./pages/my-feature/MyPage').then((m) => ({ default: m.MyPage })));
```

3. Add route configuration:

```typescript
{
	path: '/my-feature',
	element: (
		<Suspense fallback={<PageSkeleton />}>
			<MyPage />
		</Suspense>
	),
}
```

### Adding API Endpoints

1. Add types in `api/types.ts`:

```typescript
export interface MyEntity {
	id: number;
	name: string;
}
```

2. Create API module in `api/`:

```typescript
// api/myEntity.ts
import { apiClient, type ApiResponse } from './client';
import type { MyEntity } from './types';

export const myEntityApi = {
	list: () => apiClient.get<ApiResponse<MyEntity[]>>('/my-entities'),
	get: (id: number) => apiClient.get<ApiResponse<MyEntity>>(`/my-entities/${id}`),
	create: (data: Omit<MyEntity, 'id'>) =>
		apiClient.post<ApiResponse<MyEntity>>('/my-entities', data),
};
```

### Adding a Zustand Store

```typescript
// stores/myStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { debouncedLocalStorage } from '@/lib/debouncedStorage';
import { STORAGE_KEYS } from '@/lib/storageKeys';

interface MyState {
	value: string;
	setValue: (value: string) => void;
}

export const useMyStore = create<MyState>()(
	persist(
		(set) => ({
			value: '',
			setValue: (value) => set({ value }),
		}),
		{
			name: STORAGE_KEYS.myStore,
			storage: debouncedLocalStorage<MyState>(),
		}
	)
);
```

## Component Library

The UI is built with shadcn/ui components (Radix UI primitives + Tailwind CSS).

### Available Components

- **Layout**: Card, Separator, ScrollArea
- **Forms**: Button, Input, Label, Checkbox, Switch, Select
- **Feedback**: Alert, AlertDialog, Dialog, Toast
- **Navigation**: Tabs, DropdownMenu, Command
- **Data Display**: Table, Avatar, Badge, Progress
- **Overlay**: Popover, Tooltip, Sheet

### Using Components

```typescript
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
```

### Adding New shadcn/ui Components

```bash
# From frontend directory
bunx shadcn@latest add [component-name]
```

## Theming

The app supports light, dark, and system themes via CSS variables.

### Theme Configuration

Tailwind CSS 4 theme is defined in `tailwind.css` using `@theme` blocks.

### Using Theme

```typescript
import { useTheme } from '@/hooks/useTheme';

function MyComponent() {
	const { theme, setTheme } = useTheme();
	// theme is 'light' | 'dark' | 'system'
}
```

## WebSocket Integration

Real-time features use the WebSocket connection managed by the `WebSocketManager` singleton (via `useWebSocket` hook in AppShell). The hook is side-effect-only and returns `void` -- connection state is read from Zustand:

```typescript
import { useWsStore } from '@/stores/wsStore';

function MyComponent() {
	const connectionState = useWsStore((s) => s.connectionState);
	// connectionState is 'connected' | 'connecting' | 'disconnected'
}
```

## Code Splitting

All pages use `React.lazy()` with Suspense for automatic code splitting:

```typescript
const MyPage = lazy(() => import('./pages/MyPage').then((m) => ({ default: m.MyPage })));
```

The named export pattern `.then((m) => ({ default: m.ComponentName }))` is required because the codebase uses named exports exclusively.

## Related Documentation

- [Developer Guide](../docs/template/DEVELOPMENT.md)
- [API Reference](../docs/template/API_REFERENCE.md)
- [Customization](../docs/template/CUSTOMIZATION.md)
- [Testing Guide](../docs/template/TESTING.md)
