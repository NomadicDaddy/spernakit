# workspace/

Workspace management UI components.

## Components

### WorkspaceSwitcher

Dropdown for switching between the current user's workspaces. Displayed in the Sidebar and adapts to collapsed mode (icon-only). Returns `null` if no workspaces are available.

```tsx
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher';

<WorkspaceSwitcher collapsed={isSidebarCollapsed} />;
```

#### Props

| Prop        | Type      | Default | Description                                     |
| ----------- | --------- | ------- | ----------------------------------------------- |
| `collapsed` | `boolean` | `false` | When true, renders an icon-only compact variant |

## Dependencies

- `@/hooks/useWorkspace` — workspace list, active workspace, and switch handler
- `@/components/ui` — DropdownMenu, Button primitives

## Related

- [layout/Sidebar](../layout/) — hosts the workspace switcher
- Backend workspace API — `GET /api/v1/workspaces`, `PUT /api/v1/workspaces/:id`
