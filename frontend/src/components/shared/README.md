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
	searchColumn="username"
	filterPlaceholder="Search users…"
	toolbarActions={<Button>Create User</Button>}
/>;
```

#### Key Props

| Prop                   | Type                    | Description                                                  |
| ---------------------- | ----------------------- | ------------------------------------------------------------ |
| `columns`              | `ColumnDef<T>[]`        | TanStack Table column definitions                            |
| `data`                 | `T[]`                   | Row data array                                               |
| `searchColumn`         | `string`                | Column id the built-in search input filters on               |
| `filterPlaceholder`    | `string`                | Placeholder text for that search input                       |
| `pagination`           | `DataTablePagination`   | Server-side paging; omit it for client-side paging           |
| `toolbar`              | `ReactNode`             | Filters, rendered at the **left** of the toolbar row         |
| `toolbarActions`       | `ReactNode`             | The primary action, rendered at the **right** beside Columns |
| `renderExpandedRow`    | `(row: T) => ReactNode` | Detail panel rendered as a row directly beneath its parent   |
| `onRowSelectionChange` | `(rows: T[]) => void`   | Enables selection; pair with `createSelectColumn()`          |
| `selectionResetToken`  | `number \| string`      | Change it to clear the table's checkbox state                |
| `virtualize`           | `DataTableVirtualize`   | Virtual scrolling; incompatible with `renderExpandedRow`     |

The toolbar has two slots and the side matters: `toolbar` holds the controls that narrow what the
table shows, `toolbarActions` holds what the user came to do. Putting a "Create X" button in a `div`
above or below the table instead leaves the primary action in a different place on every page.

Pass `toolbarActions` a **default-size** button. It shares one flex row with the search input, the
consumer filters and the Columns trigger, all 36px; `size="sm"` is 32px and reads as a shorter pill
at the end of an otherwise even row. This example used to say `size="sm"`, which is where the one
call site that drifted got it.

### ErrorBoundary

Class-based React error boundary. Catches rendering errors in its subtree and displays a fallback UI with a retry button.

```tsx
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';

<ErrorBoundary fallback={<CustomFallback />}>
	<SomeComponent />
</ErrorBoundary>;
```

### MetricChart

Time-series area chart inside a shadcn Card. Displays metric data points with customizable color,
units, and Y-axis domain. Uses Recharts.

Pass `color` a `CHART_SERIES` entry, never a literal colour — a hard-coded hue stays the same hue
through both themes. `CHART_SERIES` deliberately excludes `--chart-1/2/3`: those are the green,
amber and red the health badges use, so a utilization series drawn in one of them asserts a status
it has no way to know.

```tsx
import { MetricChart } from '@/components/shared/charts/MetricChart';
import { CHART_SERIES } from '@/lib/chartConstants';

<MetricChart title="CPU Usage" data={points} color={CHART_SERIES.cpu} unit="%" />;
```

### TimeRangeSelector

Compact button group for selecting a time window (1h, 6h, 12h, 24h). Emits the selected hours value via `onChange`.

```tsx
import { TimeRangeSelector } from '@/components/shared/charts/TimeRangeSelector';

<TimeRangeSelector value={hours} onChange={setHours} />;
```

### ConfirmAlertDialog

Reusable confirmation dialog built on AlertDialog for destructive actions.

Pass `variant="destructive"` whenever the description says the action is permanent, cannot be
undone, or deletes something — otherwise the confirm button renders in the primary colour and reads
as no more consequential than the benign action next to it. Leave it at the default `"default"` for
reversible confirmations (impersonation, bulk state changes).

### UnsavedChangesGuard

Blocks navigation while a form is dirty and owns the "Unsaved Changes" confirmation dialog. Mount
one per page instead of calling `useUnsavedChanges` directly — the hook alone installs the block
without rendering anything to release it.

```tsx
import { UnsavedChangesGuard } from '@/components/shared/UnsavedChangesGuard';

<UnsavedChangesGuard isDirty={form.dirty} />;
```

### SectionHeader

Heading for a page section that is not itself a card — a group of cards, a chart pair, a table with
its own controls. The rung between `PageHeader` (the page's `h1`) and `CardTitle` (a heading inside a
card).

Renders the title at `text-h3`, an optional description, and a trailing action slot (`children`) for
a refresh button or a time-range selector. `level` picks `h2` or `h3` for the document outline; both
render at the same size, because a section header's size says "this is a section", not "this is the
third one down".

Use it instead of a hand-written `<h2>`/`<h3>` with hand-picked type classes. Hand-written section
titles drift: three peer sections on `/settings/system-health` were `text-sm font-medium`, smaller
than the `text-base` card titles they were heading. A section that is a _single_ panel does not need
this — give that panel a `CardHeader` with a `CardTitle`.

### RoleSelector

Dropdown selector for user roles with role hierarchy awareness.

### PasswordStrengthIndicator

Visual indicator for password strength with requirements checklist.

### StatCard

Statistics card component for displaying metric values with trend indicators. Located in `charts/StatCard.tsx`.

### skeletons/

Loading skeleton components for various content types:

- `CardSkeleton` - Card placeholder
- `ChartSkeleton` - Chart placeholder
- `ContentListSkeleton` - Content list placeholder
- `StatCardSkeleton` - Stat card placeholder
- `TableSkeleton` - Table placeholder

## Dependencies

- `@tanstack/react-table` - DataTable internals
- `recharts` - MetricChart rendering
- `@/components/ui` - primitive UI components
