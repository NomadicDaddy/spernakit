# shared/

Reusable, domain-agnostic components used across multiple pages.

## Components

### DataTable

Generic data table built on TanStack Table with sorting, filtering, pagination, row selection, and column visibility controls. Supports both client-side and server-side pagination modes.

```tsx
import { DataTable } from '@/components/shared/data-table/DataTable';

<DataTable
	columns={columns}
	data={users}
	searchKey="username"
	searchPlaceholder="Search users..."
/>;
```

#### Key Props

| Prop                 | Type                       | Description                         |
| -------------------- | -------------------------- | ----------------------------------- |
| `columns`            | `ColumnDef<T>[]`           | TanStack Table column definitions   |
| `data`               | `T[]`                      | Row data array                      |
| `searchKey`          | `string`                   | Column key for the search filter    |
| `searchPlaceholder`  | `string`                   | Placeholder text for search input   |
| `pageCount`          | `number`                   | Total pages (server-side mode)      |
| `onPaginationChange` | `(page, pageSize) => void` | Callback for server-side pagination |

### ErrorBoundary

Class-based React error boundary. Catches rendering errors in its subtree and displays a fallback UI with a retry button.

```tsx
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';

<ErrorBoundary fallback={<CustomFallback />}>
	<SomeComponent />
</ErrorBoundary>;
```

### MetricChart

Time-series area chart inside a shadcn Card. Displays metric data points with customizable color, units, and Y-axis domain. Uses Recharts.

```tsx
import { MetricChart } from '@/components/shared/charts/MetricChart';

<MetricChart title="CPU Usage" data={points} color="#3b82f6" unit="%" />;
```

### TimeRangeSelector

Compact button group for selecting a time window (1h, 6h, 12h, 24h). Emits the selected hours value via `onChange`.

```tsx
import { TimeRangeSelector } from '@/components/shared/charts/TimeRangeSelector';

<TimeRangeSelector value={hours} onChange={setHours} />;
```

### ConfirmAlertDialog

Reusable confirmation dialog built on AlertDialog for destructive actions.

### RoleSelector

Dropdown selector for user roles with role hierarchy awareness.

### PasswordStrengthIndicator

Visual indicator for password strength with requirements checklist.

### StatCard

Statistics card component for displaying metric values with trend indicators. Located in `charts/StatCard.tsx`.

### skeletons/

Loading skeleton components for various content types:

- `CardSkeleton` — Card placeholder
- `ChartSkeleton` — Chart placeholder
- `ContentListSkeleton` — Content list placeholder
- `StatCardSkeleton` — Stat card placeholder
- `TableSkeleton` — Table placeholder

## Dependencies

- `@tanstack/react-table` — DataTable internals
- `recharts` — MetricChart rendering
- `@/components/ui` — primitive UI components
