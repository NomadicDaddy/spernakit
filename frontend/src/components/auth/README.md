# auth/

Authentication and authorization components.

## Components

### ProtectedRoute

Route guard that enforces authentication and optional role-based access control.

- Verifies the user session with the server on mount
- Displays a loading skeleton during verification
- Redirects unauthenticated users to `/login`
- Blocks users without sufficient role privileges
- Renders the child `<Outlet />` for authorized users

```tsx
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

// Basic authentication gate
<Route element={<ProtectedRoute />}>
  <Route path="/dashboard" element={<DashboardPage />} />
</Route>

// Role-restricted gate
<Route element={<ProtectedRoute requiredRole="ADMIN" />}>
  <Route path="/settings" element={<SettingsLayout />} />
</Route>
```

#### Props

| Prop           | Type       | Default | Description                                            |
| -------------- | ---------- | ------- | ------------------------------------------------------ |
| `requiredRole` | `UserRole` | —       | Minimum role level required to access the child routes |

### AuthFooterLink

Footer link component used below auth forms for navigation between login, register, and reset password pages.

### AuthFormError

Inline error message display for authentication form validation and API errors.

### AuthPageLayout

Shared page layout wrapper for all authentication pages (login, register, reset password). Centers content and provides consistent branding.

### AuthStatusMessage

Status message component for authentication flows (e.g., email verification sent, password reset confirmation).

### OAuthProviderButtons

Button group for available OAuth login providers (e.g., Google, GitHub). Dynamically renders based on server-configured providers.

### DemoAccountButtons

Quick-login buttons for demo accounts. Displayed on the login page when demo mode is enabled.

## Dependencies

- `@/hooks/useAuth` — session verification
- `@/stores/authStore` — authentication state
- `@/types/roles` — role hierarchy and types
