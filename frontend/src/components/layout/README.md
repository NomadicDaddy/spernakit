# layout/

Application shell and navigation components that form the top-level layout for authenticated pages.

## Components

### AppShell

Root layout wrapper for all authenticated routes. Initializes global hooks (WebSocket, keyboard shortcuts, notification subscriptions), redirects unauthenticated users to `/login`, and renders the sidebar + header + content shell.

Registered keyboard shortcuts:

| Shortcut | Action                    |
| -------- | ------------------------- |
| `Ctrl+K` | Open command palette      |
| `?`      | Open shortcuts help       |
| `g d`    | Navigate to dashboard     |
| `g s`    | Navigate to settings      |
| `g n`    | Navigate to notifications |

### Header

Top navigation bar containing:

- Notification bell with real-time unread count (via WebSocket)
- Theme toggle (light / dark / system)
- User dropdown (profile link, logout)

### TopBar

Top-level bar component rendered above the main content area.

### CommandPalette

`Ctrl+K` / `Cmd+K` command palette for quick navigation and actions. Provides a searchable list of application pages and quick actions (theme toggle, sidebar toggle). Built on the `cmdk` dialog primitive.

### ShortcutsHelp

Dialog listing all registered keyboard shortcuts. Triggered by the `?` key.

### BugReportButton

Floating button for submitting bug reports.

### NotificationBell

Notification bell icon with real-time unread count badge (via WebSocket).

### UserMenu

User dropdown menu with profile link and logout action.

### MobileNav

Sheet-based hamburger navigation drawer visible below the `md` breakpoint. Mirrors the desktop Sidebar links and auto-closes on navigation.

### Sidebar

Collapsible desktop navigation sidebar with:

- Workspace switcher (see [workspace/](../workspace/))
- Primary nav links: Dashboard, Dashboards, Notifications, Settings, Profile
- Collapse toggle (icons-only mode with tooltips)

Sidebar state is persisted via `sidebarStore`.

### navConfig

Navigation link definitions used by Sidebar and MobileNav.

### TabLayout

Reusable tab-based layout wrapper for pages with multiple tabs (e.g., Settings, Profile).

### SkipLink

Accessibility skip-to-content link for keyboard navigation.

## Component Tree

```
AppShell
├── SkipLink
├── Sidebar          (desktop, md+)
├── TopBar / Header
│   ├── MobileNav    (mobile, <md)
│   ├── NotificationBell
│   ├── UserMenu
│   └── BugReportButton
├── CommandPalette
├── ShortcutsHelp
└── <Outlet />       (page content)
```

## Dependencies

- `@/stores/sidebarStore` - collapsed state persistence
- `@/stores/authStore` - user info for header
- `@/hooks/useWebSocket` - real-time connection
- `@/hooks/useKeyboardShortcuts` - global hotkeys
- `@/components/layout/CommandPalette` - Ctrl+K palette
- `@/components/layout/ShortcutsHelp` - ? help dialog
- `@/components/workspace/WorkspaceSwitcher` - workspace dropdown
