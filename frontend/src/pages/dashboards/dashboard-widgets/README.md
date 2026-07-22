# dashboard-widgets/

Dashboard widget rendering system for custom monitoring dashboards.

## Components

### DashboardWidgetRenderer

Renders a single dashboard widget based on its `widgetType` and `metricType`. Dispatches to an internal sub-component for each widget type.

```tsx
import { DashboardWidgetRenderer } from './dashboard-widgets/DashboardWidgetRenderer';

<DashboardWidgetRenderer widget={widget} />;
```

#### Props

| Prop     | Type              | Description               |
| -------- | ----------------- | ------------------------- |
| `widget` | `DashboardWidget` | Widget configuration data |

#### Supported Widget Types

| Type            | Internal Component   | Description                          |
| --------------- | -------------------- | ------------------------------------ |
| `stat_card`     | `StatCardWidget`     | Single metric value with icon        |
| `gauge`         | `GaugeWidget`        | Percentage gauge with progress bar   |
| `line_chart`    | `LineChartWidget`    | Time-series line/area chart          |
| `bar_chart`     | `BarChartWidget`     | Vertical bar chart for metric trends |
| `health_status` | `HealthStatusWidget` | System health indicator              |
| `alert_list`    | `AlertListWidget`    | Recent alert entries                 |
| `table`         | `TableWidget`        | Tabular data display                 |

### Exported Constants

- **`METRIC_ICON`** - `Record<MetricType, LucideIcon>` mapping metric types to their display icons
- **`WIDGET_TYPE_ICON`** - `Record<WidgetType, LucideIcon>` mapping widget types to their display icons

### useWidgetData Hook (internal)

Fetches and transforms metric data for a widget using React Query. Configures refresh intervals and time ranges from the widget configuration.

## Dependencies

- `@/api/dashboards` - widget and metric types
- `@tanstack/react-query` - data fetching
- `recharts` - chart rendering (line, bar, area)
- `@/components/ui` - Card, Progress, Skeleton primitives

## Related

- [DashboardListPage](../) - dashboard CRUD
- [CustomDashboardPage](../) - drag-and-drop editor
- [SharedDashboardPage](../) - public share view
