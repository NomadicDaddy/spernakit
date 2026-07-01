# ui/

Primitive UI components from [shadcn/ui](https://ui.shadcn.com/) (New York style). These are accessible, composable building blocks based on Radix UI primitives and styled with Tailwind CSS.

## Available Components

| Component        | File                | Based On              |
| ---------------- | ------------------- | --------------------- |
| Alert            | `alert.tsx`         | —                     |
| AlertDialog      | `alert-dialog.tsx`  | Radix AlertDialog     |
| Avatar           | `avatar.tsx`        | Radix Avatar          |
| Badge            | `badge.tsx`         | —                     |
| Button           | `button.tsx`        | —                     |
| Card             | `card.tsx`          | —                     |
| Command          | `command.tsx`       | cmdk                  |
| Dialog           | `dialog.tsx`        | Radix Dialog          |
| DropdownMenu     | `dropdown-menu.tsx` | Radix DropdownMenu    |
| Input            | `input.tsx`         | —                     |
| Label            | `label.tsx`         | Radix Label           |
| Popover          | `popover.tsx`       | Radix Popover         |
| Progress         | `progress.tsx`      | Radix Progress        |
| Select           | `select.tsx`        | Radix Select          |
| Separator        | `separator.tsx`     | Radix Separator       |
| Sheet            | `sheet.tsx`         | Radix Dialog (drawer) |
| Skeleton         | `skeleton.tsx`      | —                     |
| Switch           | `switch.tsx`        | Radix Switch          |
| Table            | `table.tsx`         | —                     |
| Toaster (Sonner) | `sonner.tsx`        | sonner                |
| Tooltip          | `tooltip.tsx`       | Radix Tooltip         |

## Barrel Export

All components are re-exported from `index.ts`:

```tsx
import { Button, Card, CardContent, Input, Label } from '@/components/ui';
```

## Adding New Components

Use the shadcn CLI to add components:

```bash
bunx shadcn@latest add <component-name>
```

The project uses the **New York** style variant. Components are installed into this directory and can be customized freely after installation.

## Theming

Theme tokens are defined as CSS custom properties in `frontend/src/index.css` using `@theme` directives. Components reference these tokens via Tailwind utility classes (e.g., `bg-primary`, `text-muted-foreground`).
