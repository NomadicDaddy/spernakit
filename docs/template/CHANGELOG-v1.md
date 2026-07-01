# Changelog

All notable changes will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.8.0] - 2026-02-01

### Security

- **CORS Hardening** — Default `cors.allowNoOrigin` changed from `true` to `false`, rejecting requests without an `Origin` header in production. Development mode auto-allows no-origin requests so Vite dev proxy continues to work.
- **Auth Rate Limiter** — Hardened login rate limit from 100 requests/min to 10 requests/min.
- **Strict CSP Default** — Enabled `security.strictCsp` by default for production builds, removing `unsafe-inline` from script-src and style-src directives.
- **Swagger Auth Gate** — Swagger API docs (`/api-docs`) gated behind `SYSOP`/`ADMIN` authentication in production. Development mode remains open.
- **Timing-safe API Key Comparison** — Replaced direct string comparison with `crypto.timingSafeEqual()` in API key authentication middleware to prevent timing attacks.
- **Timing-safe Hash Verification** — Updated `verifyHash()` in `utils/security.ts` and password reset token comparison to use `crypto.timingSafeEqual()`.
- **Validation Error Value Redaction** — Submitted field values are now redacted from validation error responses to prevent data leakage.
- **WebSocket Message Size Limit** — Configured `maxPayload: 65536` on WebSocket server to prevent memory exhaustion from oversized messages.
- **WebSocket Channel Authorization** — Added role-based authorization to WebSocket channel subscriptions (`system:` requires SYSOP, `admin:` requires ADMIN+, `user:` restricted to owning user).

### Changed

- **Frontend Component Convention (Card/View/Form)**
    - Established Card/View/Form role-based convention for organizing entity components
    - Moved entity-specific components from `components/` to `pages/{entity}/` directories
    - Consolidated `components/users/` into `pages/users/`
    - Consolidated `components/settings/` into `pages/settings/`
    - All modals now use the shared `Modal` component for consistent behavior
    - Renamed `UserSecurityModal` to `UserSecurityView` (read-only detail view role)
    - Renamed `RoleApiTestModal` prop `open` to `isOpen` for prop naming consistency
    - Refactored `ChangePasswordModal` to use shared `Modal` component
    - Refactored `RoleApiTestModal` to use shared `Modal` component

- **Type Centralization**
    - Created `backend/src/types/audit.ts` with centralized `AuditContext` interface
    - Created `backend/src/types/error.ts` with centralized `ErrorWithStatus` interface
    - Removed duplicate local type definitions from controllers and services

- **Controller Service File Renaming**
    - Renamed `authDemoAccountsControllerService.ts` → `authDemoAccountsController.ts`
    - Renamed `authPasswordPolicyControllerService.ts` → `authPasswordPolicyController.ts`
    - Renamed `authPasswordResetControllerService.ts` → `authPasswordResetController.ts`
    - Renamed `authSecurityHealthControllerService.ts` → `authSecurityHealthController.ts`
    - Renamed `authSessionControllerService.ts` → `authSessionController.ts`

- **Frontend API Service** — Replaced `as any` cast with proper Axios header types in `frontend/src/services/api.ts`

### Added

- **Documentation**
    - Added `docs/template/advanced/COMPONENTS.md` — Card/View/Form component convention guide with role definitions, directory placement, naming rules, data flow, modal usage, and worked example
    - Added `docs/template/adr/adr-008-component-conventions.md` — Architecture Decision Record
    - Added `docs/template/API_STANDARD.md` — API design standard reference
    - Added cross-references in DEVELOPMENT.md, CUSTOMIZATION.md, and components README

- **Barrel Files**
    - Added `index.ts` barrel exports for: `pages/login/`, `pages/notifications/`, `pages/profile/`, `pages/roles/`, `pages/settings/`, `pages/users/`

### Removed

- `opencode.json` configuration file
- `components/users/` directory (consolidated into `pages/users/`)
- `components/settings/` directory (consolidated into `pages/settings/`)
- `RequestWithAuth` type alias (redundant — `req.user` available via global `express.d.ts` augmentation)
- Placeholder `deleteOwnRecords` endpoint and `DELETE /api/data/records` route
- Non-functional `updateSettings` health check method and `PUT /api/health-checks/settings` route
- `nodemon` dependency (replaced by Bun native `--watch`)
- Obsolete Prisma `binaryTargets` configuration (`["native", "debian-openssl-3.0.x"]` → default native)

## [1.7.8] - 2026-01-26

### Changed

- **Backend Audit Service Refactoring**
    - Refactored `auditService.ts` from 699 lines to 255 lines
    - Created shared types file (`audit/types.ts`) for centralized audit type definitions
    - Extracted `AuditWriteService` for all audit log write operations (logEvent, logAuth, logCreate, logUpdate, logDelete)
    - Extracted `AuditQueryService` for all audit log read operations (getAuditLogs, getAuditStats, listLogs, getLogById)
    - Extracted `AuditExportService` for audit log export and cleanup operations (exportToCSV, exportToJSON, cleanupOldLogs)
    - Main `auditService` now acts as a facade delegating to specialized services

- **Backend Controller Refactoring**
    - Extracted `AuthSessionControllerService` for login, logout, token validation
    - Extracted `AuthPasswordResetControllerService` for password reset workflows
    - Extracted `AuthPasswordPolicyControllerService` for policy and validation
    - Extracted `AuthSecurityHealthControllerService` for security monitoring
    - Extracted `AuthDemoAccountsControllerService` for demo account management
    - Refactored `AuthController` to delegate to specialized services

- **Backend Notification Service Refactoring**
    - Created `NotificationQueryService` for all read operations
    - Created `NotificationWriteService` for all write operations
    - Extracted shared types to dedicated types file
    - Refactored `NotificationService` to use query/write separation

- **Backend Configuration & Routes Refactoring**
    - Split `configLoader.ts` into `configLoaderParts/` (appConfig, deepMerge, keyGeneration, loadConfig, validateConfig)
    - Split `authorization.ts` into `authorizationParts/` (roleGuards, userAuthorization)
    - Split `validation.ts` into `validationSchemas/schemas.ts`
    - Split `settingsRoutes.ts` into `settings/` directory (adminSettingsRoutes, coreSettingsRoutes, smtpRoutes, applicationApiRoutes)
    - Split `userRoutes.ts` into `users/` directory (userCrudRoutes, userProfileRoutes, userSecurityRoutes)

- **Frontend Component Extraction (Notifications)**
    - Extracted `NotificationBulkActions` component
    - Extracted `NotificationFilterBar` component
    - Extracted `NotificationItem` component
    - Extracted `NotificationStatisticsCards` component

- **Frontend Component Extraction (Roles)**
    - Extracted `RBACMatrix` component
    - Extracted `RoleApiTestModal` component
    - Moved RBAC data and types to dedicated files (`rbacMatrixData.ts`, `types.ts`)

- **Frontend Component Extraction (Settings)**
    - Extracted `AuthSecuritySettingsForm` from `AuthenticationSettings.tsx`
    - Extracted `SessionInfoDisplay` from `AuthenticationSettings.tsx`
    - Extracted `PasswordResetForm` from `ResetPasswordToken` page
    - Extracted `AuditLogTable` from `AuditLogsContent` settings component
    - Extracted `ThemeSelector`, `LanguageSelector`, `TimezoneSelector` from `PreferencesTab`

### Added

- **Performance: Virtual Scrolling**
    - Added `VirtualScrollList` to Notifications page for improved rendering performance with large datasets
    - Only visible items are rendered, reducing DOM overhead

- **Performance: Passive Event Listeners**
    - Configured passive event listeners (`passive: true/false`) across modal and keyboard shortcut components
    - Enhances scroll performance and reduces main thread blocking

### Removed

- Outdated audit documentation and status files
- Completed audit feature tracking files

### Audits

- **SPERNAKIT Audit**: Score 96/100 (Grade A-)
    - Complete architecture compliance
    - Proper frontend API standards and data router pattern
    - Comprehensive styling system with OKLCH colors
    - Strong security patterns (RBAC, JWT, audit logging)
    - Native WebSocket implementation
    - VirtualScrollList functional

- **REACT_BEST_PRACTICES Audit**: Score 95/100 (Grade A)
    - Excellent bundle optimization (direct imports, tree-shaking, code splitting)
    - Proper parallel data fetching with Promise.all
    - TanStack Query for automatic deduplication and caching
    - localStorage versioned with proper error handling
    - React Compiler enabled for automatic optimization

### Impact

- **Maintainability**: Large monolithic files broken into focused, single-responsibility modules
- **Testability**: Smaller services are easier to unit test in isolation
- **Performance**: Virtual scrolling and passive event listeners improve UI responsiveness
- **Code Organization**: Clear separation between read/write operations and domain concerns
- **Audit Compliance**: Both SPERNAKIT and REACT_BEST_PRACTICES audits passed with A grades

## [1.7.7] - 2026-01-26

### Changed

- **SSOC Architecture Fix**
    - Moved `AuthenticationSettings.tsx` from `components/settings/` to `pages/settings/`
    - Moved `EnhancedNotificationSettings.tsx` from `components/settings/` to `pages/settings/`
    - Components that depend on page-scoped context now correctly reside in `pages/`
    - Updated `routes.tsx` imports for relocated components
    - Updated `components/README.md` settings directory description

- **Role System Consolidation**
    - `backend/src/types/roles.ts` is now the single source of truth for role definitions
    - `backend/src/constants/roles.ts` re-exports from `types/roles.ts` for backward compatibility
    - Eliminates duplicate role hierarchy and utility function definitions

- **Combined Auth Middleware**
    - Backend routes now use `combinedAuth` middleware (supports both session and API key authentication)
    - Updated routes: auditLogRoutes, dashboardRoutes, dataRoutes, healthCheckRoutes, notificationRoutes, roleRoutes, settingsRoutes, userRoutes
    - Auth routes remain session-only (login/logout are inherently session-based)

### Removed

- **Unused Production Dependency**
    - Removed `@libsql/client` from `backend/package.json` (unused after Prisma adapter handles connection)

- **Unused Development Dependencies**
    - Removed `@types/swagger-jsdoc` from root `package.json` (duplicate of backend)
    - Removed `@types/swagger-ui-express` from root `package.json` (duplicate of backend)

- **Unused Frontend Types**
    - Removed 8 unused type definitions from `frontend/src/types/index.ts`:
        - `PaginatedResponse<T>` - Backend pagination types used instead
        - `AuditLog` - Service defines its own type
        - `DashboardStats` - Never imported
        - `LoginForm` - Local types in pages/login/
        - `SettingForm` - Never imported
        - `UserForm` - Local types in pages/users/
        - `Setting` - Consumers define locally
        - `UserStatistics` - Only referenced by unused DashboardStats

### Fixed

- **Dependency Version Check Script**
    - Removed stale `@libsql/client` reference from `scripts/check-dependency-versions.ts`

### Impact

- **Architecture**: SSOC compliance restored - shared components no longer import from page-scoped contexts
- **Maintainability**: Single source of truth for role definitions reduces sync errors
- **API Flexibility**: Routes now support both session-based and API key authentication
- **Bundle Size**: Removed unused types reduces TypeScript compilation overhead
- **Template Hygiene**: Cleaner dependency tree with unused packages removed

## [1.7.6] - 2026-01-26

### Added

- **Modal Accessibility Improvements**
    - Migrated `KeyboardShortcutsModal` to native `<dialog>` element with proper ARIA attributes
    - Migrated `ChangePasswordModal` to native `<dialog>` element with proper ARIA attributes
    - Added `aria-labelledby`, `aria-modal`, and `aria-hidden` attributes for screen reader support
    - Proper modal semantics with `dialog.showModal()` and `dialog.close()` APIs
    - Added close button with X icon to `ChangePasswordModal` header

- **Layout System Enhancements**
    - Added full-width layout support to `SidebarLayout` component
    - Layout now respects user's `layout` preference setting (centered vs full-width)
    - Dynamic container classes based on user settings

- **CSS Component Library Additions**
    - Native `<dialog>` element styling with `::backdrop` support
    - Collapse/accordion component styles (`.collapse`, `.collapse-title`, `.collapse-content`)
    - Additional loading spinner sizes (`.loading-md`, `.loading-xs`)
    - Loading dots animation (`.loading-dots`)
    - Screen reader only class for modal backdrop forms

- **Authentication Improvements**
    - Login response now includes user permissions to avoid race condition with cookie
    - Eliminated separate API call to fetch permissions after login
    - Updated `AuthContext` to use permissions from login response directly

- **Setup Script Enhancements**
    - Support for configurable backend and frontend ports in Docker configuration
    - Dynamic user/group name substitution in Dockerfile
    - Docker Compose service name and image tag substitution
    - Port configuration in Docker health checks

### Changed

- **Development Scripts**
    - `dev`, `dev:no-logs`, and `dev:quick` scripts now stop existing servers before starting
    - Added `bun run stop` to dev workflow for cleaner restarts

- **Documentation**
    - Added `bun run stop` command to STACK.md

### Removed

- **Obsolete Feature Definitions**
    - Removed `lazy-charts` feature definition (feature completed)
    - Removed `lazy-modals` feature definition (feature completed)

### Impact

- **Accessibility**: Native dialog elements provide better screen reader support and keyboard navigation
- **User Experience**: Faster login with permissions included in response, no additional API call
- **Developer Experience**: Dev scripts automatically stop running servers before restart
- **Deployment**: More flexible Docker configuration with configurable ports and naming

## [1.7.5] - 2026-01-25

### Added

- **Real-Time Monitoring Dashboard**
    - Live monitoring dashboard with WebSocket updates
    - Role-based access control for monitoring endpoints
    - Distributed tracing system with correlation IDs
    - Frontend correlation ID tracking for request tracing

- **Performance Optimization Features**
    - Dashboard auto-refresh with configurable intervals
    - Page Visibility API integration to pause polling when tab inactive
    - Virtual scrolling for large datasets
    - Performance budget enforcement in build process
    - Lazy loading for Recharts library
    - Passive event listeners for mousedown/touchstart events
    - Vite `optimizePackageImports` for lucide-react icons

- **Web Vitals Enhancements**
    - Web Vitals alerting and monitoring system
    - Backend performance monitoring utility
    - Optional authentication for vitals endpoint (captures pre-auth metrics)

- **Configuration System**
    - Centralized JSON configuration (migrated from environment variables)
    - Configurable health check cleanup interval
    - Configurable token cleanup interval
    - Configurable account lockout and password policy settings
    - Extended health check log retention from 10 to 90 days

- **Validation & Security**
    - Query parameter validation for GET endpoints
    - Route parameter validation middleware
    - Complete input validation coverage
    - Hybrid password validation for instant frontend feedback
    - Dependency version check in smoke tests

- **Documentation**
    - Architecture Decision Records (ADRs)
    - Critical flow walkthrough documentation
    - Comprehensive testing guide
    - Audit execution guide
    - JSDoc documentation for frontend React components
    - JSDoc coverage for all controller methods
    - Inline documentation for Prisma migration files
    - README files for key directories

- **Historical Analytics**
    - Historical trend analysis backend service and API
    - Scheduled task monitoring
    - Health check alert configuration UI

### Changed

- **Framework Upgrades**
    - Upgraded to React v19
    - Upgraded to react-router-dom v7
    - Manual form handling with `useActionState` hook

- **Backend Architecture**
    - Refactored health check controller to class-based pattern
    - Consolidated duplicate authentication checks in authorization middleware
    - Refactored getUserPermissions to use data-driven approach
    - Request-scoped caching for service deduplication
    - Centralized 204 No Content response handling
    - Explicit HTTP status codes on all success() calls

- **Frontend Architecture**
    - Consolidated notification service files into single module
    - Direct ESM icon imports replacing lucide-react barrel imports
    - Version prefix added to localStorage keys for schema migration safety
    - Centralized date formatting utilities
    - Standardized TanStack Query cache configuration

- **API Design**
    - Standardized error response format with error details
    - DELETE endpoints now return 204 No Content
    - RESTful bulk delete notifications with request body array
    - Batched audit log archive cleanup to prevent memory issues

### Fixed

- Auth safety timeout state ownership in AuthContext
- Missing staleTime configuration in useQuery hooks
- Weak email regex validation
- Privilege escalation bug in preventPrivilegeEscalation middleware
- JWT algorithm confusion attack vulnerability
- Unbounded query in getUnreadNotifications
- Database URL initialization from config
- Broken documentation links in README
- Console logging inconsistency (replaced with logger)
- Empty catch blocks in auth controller
- Notification broadcast batch size compliance
- Duplicate audit logging in recordFailedLogin
- Inconsistent null check in AuthContext validation

### Security

- Full password policy validation added to changePassword endpoint
- Authentication middleware added to profile update route
- Safe error responses to prevent information disclosure
- CORS configuration enhanced with security controls and logging
- Removed legacy encryption format support

### Removed

- Unused UI components and shared components from frontend
- Unused API key authentication middleware
- Unused taskRegistryService
- Unused performanceMonitor utility
- Dead trend analysis code
- Unused WebVitals monitoring component
- Duplicate QuickActions component (moved to examples)
- Orphaned backend API routes

## [1.7.4] - 2026-01-19

### Added

- **Frontend UI Component Library**
    - New `DataTable` component for reusable data tables with pagination and filtering
    - New `EmptyState` component for consistent empty data displays
    - New `StatusBadge` component for uniform status indicators
    - New chart components: `DonutChart`, `MiniChart`, `ProgressRing`
    - New `StatCard` component for dashboard statistics
    - New `TabNav` component for tabbed navigation
    - New `HydrateFallback` component for hydration loading states

- **Frontend Custom Hooks**
    - `useApi` - TanStack Query wrapper for API calls
    - `useMutation` - TanStack Query mutation wrapper
    - `useNotificationStream` - Real-time notification handling with WebSocket
    - `useSubscription` - WebSocket channel subscription management
    - `formatShortcut` - Keyboard shortcut formatting utility
    - `groupShortcutsByCategory` - Keyboard shortcuts grouping utility

- **Layout and Navigation System**
    - New sidebar navigation with collapsible menu (`Sidebar.tsx`, `Header.tsx`)
    - New navbar navigation with mobile support (`Navigation.tsx`)
    - New `RouteLayouts.tsx` for route-based layout management
    - New `navConfig.ts` for centralized navigation configuration
    - New `SettingsLayout.tsx` for settings page layout
    - New `ProfileLayout.tsx` for profile page layout

- **Backend Permission System**
    - New `accessLevels.ts` - Access level constants and type definitions
    - New `canManageRole.ts` - Role management permission checker
    - New `hasAnyAccess.ts` - Any access permission checker
    - New `hasFullAccess.ts` - Full access permission checker
    - New `hasPermission.ts` - Specific permission checker
    - New `permissionDefinitions.ts` - Permission type definitions
    - New `roleManagementRules.ts` - Role management rules and constraints
    - New `rolePermissions.ts` - Role permission mappings

- **Database Transaction Support**
    - Added `TransactionClient` type to audit service for optional transaction support
    - Added transaction wrapping to user CRUD operations (create, update, delete)
    - Added transaction wrapping to settings upsert operations
    - Proper error re-throwing for automatic rollback on transaction failures

- **Audit Log Management**
    - Added `archiveLogsToFile()` method to export logs before deletion
    - Updated `cleanupOldLogs()` to archive logs to `data/archives/audit/`
    - Archive files use timestamp-based naming: `audit-archive-{timestamp}.json`
    - Returns structured result with archived count, deleted count, and archive path
    - Automatic archive directory creation if it doesn't exist

- **Security Enhancements**
    - Email field removed from JWT token payload to prevent PII exposure
    - Added `getPasswordPolicy()` utility for centralized password policy access
    - Added `logPermissionFailure()` utility for permission failure logging
    - Added `validateAndSanitizeEmail()` utility for email validation and sanitization
    - Added `validatePassword()` utility for password strength validation
    - Added `validateRolePermissions()` utility for role permission validation
    - Improved auth robustness with better error handling

- **Frontend Services**
    - New `wsClient.ts` with comprehensive WebSocket client implementation
    - New `broadcastNotification.ts` - Notification broadcasting service
    - New `createNotification.ts` - Notification creation service
    - New `deleteNotification.ts` - Notification deletion service
    - New `getNotification.ts` - Single notification fetch service
    - New `getNotificationStatistics.ts` - Notification statistics service
    - New `getUnreadNotificationCount.ts` - Unread count service
    - New `listNotifications.ts` - Notification list service
    - New `markAllNotificationsAsRead.ts` - Bulk mark read service
    - New `markNotificationAsRead.ts` - Single mark read service
    - New `bulkDeleteNotifications.ts` - Bulk delete service
    - New `bulkMarkNotificationsAsRead.ts` - Bulk mark read service

- **Frontend Utilities**
    - New `dateFormat.ts` utility for date formatting
    - New `getPasswordRequirements.ts` utility for password requirements
    - New `getStrengthColor.ts` utility for password strength color
    - New `getStrengthText.ts` utility for password strength text
    - New `validatePassword.ts` utility for password validation
    - New `validatePasswordRealTime.ts` utility for real-time password validation
    - New `configureWebVitals.ts` utility for Web Vitals configuration
    - New `initWebVitals.ts` utility for Web Vitals initialization
    - New `isWebVitalsSupported.ts` utility for Web Vitals support detection
    - New `getCurrentMetrics.ts` utility for current metrics retrieval
    - New `getFormattedMetrics.ts` utility for formatted metrics retrieval
    - New `webVitalsHelpers.ts` utility for Web Vitals helpers
    - New `performance.ts` utility for performance utilities

- **Frontend Contexts**
    - New `ProfileContext.tsx` for profile state management
    - New `SettingsContext.tsx` for settings state management

- **Frontend Pages**
    - New `SettingsPageLayout.tsx` for settings page structure
    - New `ApplicationSettingsTab.tsx` for application-specific settings
    - New `NotFound.tsx` for 404 error page

- **Frontend Examples**
    - New `GlobalSearchExample.tsx` in components/examples directory
    - Moved `VirtualScrollList.tsx` to examples directory

- **Class-Based Dark Mode**
    - Added Tailwind v4 `@variant` directive for class-based dark mode
    - Dark theme now controlled by `.dark` class on parent element

### Changed

- **Frontend Architecture - WebSocket Refactoring**
    - Replaced `WebSocketContext` and `WebSocketProvider` with `useWebSocket` hook
    - Improved connection management with automatic reconnection
    - Added channel-based subscription system
    - Enhanced error handling and connection state tracking
    - Removed deprecated `useEventSubscription` hook
    - Components now use `useWebSocket` hook directly instead of context

- **Frontend Architecture - Named Exports**
    - Converted all React components from default to named exports
    - Improved tree-shaking and bundle optimization
    - Better IDE autocomplete and import suggestions
    - Updated all lazy loading logic in `routes.tsx` for named exports
    - Updated `PasswordStrengthIndicator` to use apiService instead of raw fetch

- **Frontend Architecture - Page Structure**
    - Restructured Profile page with context-based architecture
    - Restructured Settings page with context-based architecture
    - Split Profile page into tabs with separate components
    - Split Settings page into tabs with separate components
    - Better separation of concerns between layout and content

- **Frontend Architecture - Routing**
    - New `routes.tsx` with route-based layout system
    - Separated authenticated and unauthenticated route functions
    - Improved route organization and code splitting
    - Better handling of auth loading states

- **Frontend Services - Consolidation**
    - Consolidated 8 granular health check service files into single `healthCheckService.ts` object
    - Health check service now exports methods: `acknowledgeAlert`, `cleanup`, `getAlerts`, `getResults`, `getStatistics`, `resolveAlert`, `restart`, `run`
    - Updated components to use service object methods instead of individual imports
    - Reduced frontend/src/services directory by 8 files (103 lines removed)

- **Backend - Technical Debt Resolution**
    - Added explicit return type annotations to 100+ functions across controllers and services
    - Implemented comprehensive validation middleware for audit logs, dashboard, data, health checks, and settings routes
    - Converted 8+ forms to React 19 useActionState pattern
    - Added JSDoc documentation to all service functions
    - Sorted package.json keys alphabetically across all packages
    - Fixed authentication middleware to properly handle null user validation

- **Backend - Error Handling**
    - Created `extractErrorMessage()` utility to consolidate error message extraction
    - Replaced 30 duplicate error extraction patterns across 8 controllers
    - Created `createAuditContext()` utility for audit context creation
    - Replaced 4 inline audit context creations in userController.ts

- **Backend - Audit Service**
    - Enhanced with comprehensive JSDoc documentation
    - Added support for transaction clients
    - Improved error handling and logging
    - Better audit context creation and management

- **Backend - Health Check Service**
    - Added comprehensive JSDoc documentation
    - Enhanced error handling and logging
    - Improved service lifecycle management
    - Better cleanup and restart functionality

- **Backend - Notification Service**
    - Added comprehensive JSDoc documentation
    - Enhanced error handling and logging
    - Improved notification creation and management
    - Better preference checking and filtering

- **Backend - Security Email Service**
    - Added comprehensive JSDoc documentation
    - Enhanced error handling and logging
    - Improved email sending reliability

- **Backend - System Metrics Service**
    - Added comprehensive JSDoc documentation
    - Enhanced error handling and logging
    - Improved metrics collection and aggregation

- **Backend - Token Cleanup Service**
    - Added comprehensive JSDoc documentation
    - Enhanced error handling and logging
    - Improved token cleanup reliability

- **Backend - User Service**
    - Added comprehensive JSDoc documentation
    - Enhanced error handling and logging
    - Improved user CRUD operations
    - Better transaction support and audit logging

- **Backend - Demo Account Service**
    - Enhanced JSDoc documentation
    - Improved demo account alignment with seeded users
    - Better demo account management

- **Backend - Password Reset Service**
    - Enhanced JSDoc documentation
    - Improved password reset flow handling
    - Better token management

- **Backend - Token Service**
    - Enhanced JSDoc documentation
    - Improved token generation and validation
    - Better token lifecycle management

- **Backend - Authorization Service**
    - Enhanced JSDoc documentation
    - Improved authorization checks
    - Better permission validation

- **Performance Optimizations**
    - `healthCheckService.runAllChecks()`: Converted sequential for-loop to parallel `Promise.all()`
    - `alertService.sendAlertNotification()`: Converted sequential notification loop to parallel `Promise.all()`
    - Added `MAX_BROADCAST_BATCH_SIZE` (1000) limit to `notificationBroadcast.ts` functions
    - Added `MAX_STATISTICS_LOGS` (10000) limit to `statisticsService.ts` queries
    - Added soft delete filter (`isDeleted: false`) to broadcast queries
    - Added warning logs when batch limits are reached
    - Reduced chunkSizeWarningLimit from 1000KB to 300KB for better bundle size monitoring

- **Security Improvements**
    - Email field removed from JWT token payload (BREAKING CHANGE: code decoding JWT tokens directly must be updated to fetch email from `/api/auth/profile` endpoint)
    - Replaced mock session creation time with actual token iat timestamp
    - Centralized password policy constants to eliminate magic numbers
    - Removed unnecessary React memoization (useCallback, useMemo) with React Compiler enabled

- **Frontend Styling**
    - All components now use DaisyUI-inspired semantic classes
    - Consistent button styling with `.btn` and modifier classes
    - Consistent status indicator styling with semantic classes
    - Consistent keyboard hint styling with semantic classes

- **Frontend Error Handling**
    - Enhanced error boundaries with better fallback UI
    - Improved error message display
    - Better error recovery mechanisms

- **Frontend Dark Mode**
    - Enabled class-based dark mode with `.dark` class selector
    - Improved dark mode toggle functionality
    - Better dark mode persistence

- **Setup Script**
    - Enhanced setup validation and configuration
    - Better error handling during setup
    - Improved setup completion checks

- **Documentation**
    - Added `CUSTOMIZATION.md` guide for extending template
    - Updated template documentation with new components and patterns
    - Updated feature documentation

### Removed

- **Dead Code - Frontend Performance Utilities**
    - Deleted `performance.ts` barrel file (10 utility re-exports)
    - Deleted `VirtualScroller` utility
    - Deleted `performanceUtils` utility
    - Deleted `usePerformanceMonitor` hook
    - Deleted `bundleAnalyzer` utility
    - Deleted `LazyImageLoader` utility
    - Deleted `virtualScrollOptimizer` utility
    - Deleted `memoryOptimizer` utility
    - Deleted `imageOptimizer` utility
    - ~500 lines of unused code removed

- **Dead Code - Frontend Components**
    - Deleted `LazyChart.tsx` - unused Recharts wrapper (200+ lines)
    - Deleted `LazyModal.tsx` - unused lazy-loaded modal wrapper
    - Deleted `OptimizedImage.tsx` - unused responsive image component
    - Deleted `VirtualScrollList.tsx` (moved to examples directory)
    - ~400 lines of unused code removed

- **Dead Code - Frontend Hooks**
    - Deleted `useSubscription.ts` - replaced by new useSubscription in hooks/index.ts
    - Deleted `useMutation.ts` - replaced by new useMutation in hooks/index.ts
    - Deleted `useApi.ts` - replaced by new useApi in hooks/index.ts

- **Dead Code - Frontend Utilities**
    - Deleted `debounce.ts` utility file - unused
    - Deleted `throttle.ts` utility file - unused

- **Dead Code - Backend Middleware**
    - Deleted `combinedAuth.ts` middleware - never used in application

- **Dead Code - Backend Utilities**
    - Deleted `cache.ts` - unused SimpleCache utility (203 lines)
    - Deleted `slug.ts` - unused slug utility

- **Dead Code - Frontend Hooks**
    - Deleted `formatShortcut.ts` - duplicate of function in useKeyboardShortcuts.ts
    - Deleted `groupShortcutsByCategory.ts` - duplicate of function in useKeyboardShortcuts.ts

- **Deprecated Features**
    - Removed `useEventSubscription` hook (use new `useSubscription` instead)
    - Removed `useWebSocketContext` hook (use new `useWebSocket` instead)
    - Removed `WebSocketContext` and `WebSocketProvider` (use hooks instead)

### Fixed

- **Frontend - GlobalSearch Placeholder**
    - Moved `GlobalSearch.tsx` to `components/examples/GlobalSearchExample.tsx`
    - Updated documentation to clarify it's a template for derived applications
    - Removed from main application components as unimplemented placeholder

- **Frontend - Profile and Settings Pages**
    - Fixed context management issues in Profile page
    - Fixed context management issues in Settings page
    - Improved page layout and component organization

- **Frontend - Components**
    - Fixed component export issues after named exports migration
    - Fixed lazy loading logic for named exports
    - Fixed component type definitions

- **Backend - Database Operations**
    - Fixed data consistency issues by wrapping multi-step operations in transactions
    - Fixed audit logging atomicity issues
    - Fixed settings upsert consistency issues

- **Backend - Performance**
    - Fixed N+1 query pattern in alert notification broadcasting to admin users
    - Fixed sequential health check execution causing cumulative latency
    - Fixed unbounded findMany queries in broadcast and statistics services

- **Backend - Security**
    - Fixed PII exposure in JWT token payload
    - Fixed weak fallback secret in cookie parser
    - Fixed hardcoded secrets in configuration files

- **Backend - Audit Logs**
    - Fixed audit log hard deletion without archival
    - Fixed missing archive functionality before cleanup
    - Added proper archive file management

- **Backend - Controllers**
    - Fixed missing explicit status codes in success() helper calls
    - Fixed inconsistent response messages across controllers
    - Fixed catch variable naming inconsistencies

- **Backend - Middleware**
    - Fixed authentication middleware null user handling
    - Fixed authorization middleware permission checking
    - Fixed validation middleware coverage

### Impact

- **Architecture**: Complete frontend architecture refactoring with hooks-based WebSocket system, component library, and improved page structure
- **Performance**: ~40% reduction in health check execution time, parallel notification broadcasting, reduced bundle size through dead code removal
- **Security**: Removed PII from JWT tokens, improved password validation, enhanced permission system
- **Code Quality**: 96/96 features passing (100% completion), resolved 36 audit issues, removed ~1,300 lines of dead code
- **Developer Experience**: Comprehensive UI component library, custom hooks for common patterns, improved TypeScript type safety
- **Database**: Atomic operations with transactions, audit log archival, improved data consistency
- **Maintainability**: Consolidated services, centralized utilities, comprehensive JSDoc documentation

### Migration Notes

- **Breaking Change**: Email field removed from JWT token payload. Any code decoding JWT tokens directly must be updated to fetch email from `/api/auth/profile` endpoint instead.

- **Frontend Migration**:
    - Components using `WebSocketContext` must be updated to use `useWebSocket` hook
    - Default exports replaced with named exports - update import statements
    - `useEventSubscription` replaced by `useSubscription`
    - `VirtualScrollList` moved to examples directory - use new `DataTable` component instead

- **Backend Migration**:
    - No breaking changes to API endpoints
    - Existing migrations are compatible
    - Audit log archival now creates files in `data/archives/audit/`

- **Development Workflow**:
    - No changes to `bun run dev`, `bun run build`, `bun run smoke:qc`
    - All quality gates pass: linting, type checking, formatting, build

## [1.7.4] - 2025-12-19

### Added

- **Docker Validation Enhancements**
    - Added validation for `LABEL org.opencontainers.image.source` in Dockerfiles to ensure proper repository attribution
    - Enhanced `check-application.ts` to validate Docker labels match the application slug
    - Improved Docker smoke workflow validation with comprehensive configuration checks

- **Setup Script Improvements**
    - Dynamic Docker label generation during setup based on application slug
    - Automatic repository URL configuration in Dockerfiles for derived applications
    - Enhanced setup validation to ensure Docker labels are correctly applied

### Changed

- **Dependencies**
    - Updated Puppeteer from 24.33.1 to 24.34.0 for latest security patches and browser compatibility

- **Documentation Updates**
    - Updated template version references from 1.7.2 to 1.7.4 across all documentation
    - Updated infrastructure guide with new version information
    - Synchronized version numbers across package.json files

- **Docker Configuration**
    - Improved Docker label validation to prevent generic repository references
    - Enhanced setup script to generate app-specific Docker labels automatically

### Fixed

- **Docker Label Validation**
    - Fixed validation to ensure derived applications use their own repository URL instead of generic spernakit reference
    - Resolved Docker smoke workflow validation issues with proper label checking

### Impact

- **Security**: Latest Puppeteer version includes security patches and browser engine updates
- **Developer Experience**: Improved validation catches Docker configuration issues early
- **Consistency**: Proper repository attribution in Docker images for derived applications
- **Maintainability**: Automated Docker label generation reduces manual configuration errors

## [1.7.2] - 2025-12-19

### Added

- **Enhanced Setup Script**
    - Dynamic README updates during setup with app name, slug, and Bun version detection
    - Automatic `check-application` validation after setup to ensure configuration correctness
    - Improved port configuration handling with frontend/backend port validation

- **New Scripts**
    - `load-json-config.ts` - Centralized JSON configuration loading for all scripts
    - `check-application.ts` - Comprehensive application validation script

### Changed

- **Setup Process**
    - `scripts/setup.ts` now automatically updates README.md with app-specific details
    - Added Bun version detection from packageManager field in package.json
    - Setup now validates configuration with `check-application` before completion

- **Script Improvements**
    - `scripts/smoke.ts` now loads JSON configuration before processing
    - `scripts/squash-migs.ts` replaced `npx` with `bunx` for Prisma commands
    - Added migration status checking to prevent duplicate migration application
    - Improved error handling in `squash-migs.ts` for baseline mode

- **Smoke Test Configuration**
    - Reordered smoke test steps: format now runs after build for better error detection
    - Updated smoke.json to reflect new command execution order

- **Documentation Updates**
    - Updated all documentation references from `.env` to JSON configuration system
    - `TROUBLESHOOTING.md` - Converted environment variable references to JSON config
    - `TEMPLATE_INFRASTRUCTURE.md` - Updated configuration examples
    - `SECURITY_KEY_GENERATION.md` - Updated for JSON config workflow
    - `TEMPLATE_CHANGELOG.md` - Updated command references

### Fixed

- **Migration Handling**
    - Fixed duplicate migration application in `squash-migs.ts` baseline mode
    - Added proper error handling for already-applied migrations (P3008 error)
    - Improved Prisma command error messages with `bunx` instead of `npx`

- **Configuration Loading**
    - Fixed JSON configuration loading in smoke tests
    - Ensured consistent config loading across all scripts

### Migration Notes

- **Setup Workflow**
    - Run `bun run setup` for enhanced setup with automatic README updates
    - Setup now validates configuration before completion
    - No changes to existing development workflows

- **Backward Compatibility**
    - All existing scripts continue to work with JSON configuration
    - No breaking changes to API or application functionality

### Impact

- **Developer Experience**: Improved setup process with automatic configuration validation
- **Documentation**: Consistent JSON configuration references across all documentation
- **Reliability**: Better error handling in migration and setup processes
- **Maintenance**: Centralized configuration loading reduces duplication

## [1.7.1] - 2025-12-06

### Added

- **Backend TypeScript Migration**
    - Migrated entire backend from JavaScript to TypeScript
    - Added `backend/tsconfig.json` with strict type checking (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `strictNullChecks`)
    - Added `backend/src/types/express.d.ts` for Express type extensions
    - All controllers, services, middleware, routes, and utilities now TypeScript

- **Scripts TypeScript Migration**
    - Migrated all scripts from JavaScript/PowerShell to TypeScript
    - Added `scripts/tsconfig.json` for script type checking
    - New TypeScript scripts: `setup.ts`, `smoke.ts`, `generate-keys.ts`, `dev-with-logs.ts`, `check-page.ts`, `crawltest.ts`, `load-json-config.ts`, `run-prisma.ts`, `reset-packages.ts`, `squash-migs.ts`, `optimize-images.ts`, `verify-compression.ts`, `verify-minification.ts`, `wait-for-http.ts`, `test-auth-reset-api.ts`, `test-auth-reset-ui.ts`, `check-application.ts`
    - Removed PowerShell scripts (replaced by `.ts` equivalents)

- **JSON Configuration System**
    - New `scripts/load-json-config.ts` for centralized JSON config loading
    - New `docs/template/CONFIGURATION.md` comprehensive configuration guide
    - Configuration loaded from `config/{appname}.json` instead of `.env` files
    - Auto-generation of config from `backend/src/config/defaults.json` if missing
    - Secure key generation integrated into config creation

- **Frontend Configuration Loader**
    - New `frontend/vite-config-loader.ts` for Vite JSON config integration
    - Vite now reads configuration from JSON config file
    - Removed dependency on `.env` files for frontend builds

- **New Package Scripts**
    - `reset-packages` - Interactive dependency reset with TypeScript
    - `squash-migs` / `squash-migs:reset` - Database migration management
    - `generate` - Prisma client generation shortcut

- **Documentation Restructure**
    - Moved all template docs to `docs/template/` directory

### Changed

- **Configuration Architecture**
    - Replaced `.env` file usage with JSON configuration (`config/{appname}.json`)
    - Added `bunfig.toml` with `env = false` to disable Bun's automatic `.env` loading
    - `configLoader.ts` now populates `process.env` from JSON config for backward compatibility
    - All environment variable references now sourced from JSON config

- **Backend Architecture**
    - All `.js` files renamed to `.ts` with full type annotations
    - Services now use typed interfaces and return types
    - Controllers use typed request/response handlers
    - Middleware uses proper Express type extensions
    - Prisma generated types integrated throughout

- **Scripts Architecture**
    - All scripts now use ES modules with TypeScript
    - Improved error handling with typed exceptions
    - Better CLI argument parsing with type safety
    - Cross-platform compatibility (removed PowerShell dependency)

- **Build System**
    - `typecheck` script now validates backend, frontend, and scripts
    - `lint:scripts` now targets `.ts` files only
    - Smoke tests run via `bun scripts/smoke.ts` instead of PowerShell

- **Documentation Updates**
    - `GETTING_STARTED.md` - Updated for JSON config workflow
    - `TROUBLESHOOTING.md` - Updated commands and references for JSON config
    - `CUSTOMIZATION.md` - Updated environment configuration examples
    - `DEPLOYMENT.md` - Updated for JSON config deployment
    - `SECURITY_KEY_GENERATION.md` - Updated for TypeScript key generation
    - `DEVELOPMENT.md` - Added TypeScript development guidance
    - `advanced/HEALTH_CHECK_SYSTEM.md` - Updated config references

- **Docker Configuration**
    - `docker-compose.yml` updated for JSON config volume mounts
    - `docker/README.md` updated with JSON config instructions
    - `docker/PORT-CONFIGURATION.md` updated for new config system

- **Frontend Improvements**
    - `useUsersList.ts` hook added for user list management
    - Various component type safety improvements
    - Vite config now uses JSON config loader

### Removed

- **Deprecated Files**
    - Removed example environment file (replaced by JSON config)
    - Removed `backend/src/config/environment.js` (replaced by `.ts`)
    - Removed `backend/src/config/server.js` (replaced by `.ts`)
    - Removed `backend/src/config/services.js` (replaced by `.ts`)
    - Removed `backend/src/utils/database.js` (replaced by `.ts`)
    - Removed `backend/src/utils/response.js` (replaced by `.ts`)
    - Removed `scripts/setup.js` (replaced by `.ts`)
    - Removed PowerShell helper scripts (replaced by `.ts`)
    - Removed `bun.lock` text file (replaced by `bun.lockb` binary)

- **Legacy JavaScript Backend Files**
    - All `.js` controller files replaced by `.ts` equivalents
    - All `.js` service files replaced by `.ts` equivalents
    - All `.js` middleware files replaced by `.ts` equivalents
    - All `.js` route files replaced by `.ts` equivalents
    - All `.js` utility files replaced by `.ts` equivalents

### Migration Notes

- **Configuration Migration**
    - Existing `.env` files are no longer read
    - Run `bun run setup` to generate `config/{appname}.json` from defaults
    - Or run `bun run generate-keys` to create config with secure keys
    - All settings previously in `.env` now go in JSON config

- **Development Workflow**
    - No changes to `bun run dev`, `bun run build`, `bun run smoke:qc`
    - Scripts now run via Bun's TypeScript execution
    - PowerShell no longer required for any scripts

- **Backward Compatibility**
    - `process.env` still works - populated from JSON config at startup
    - Existing code reading `process.env.VARIABLE` continues to work
    - No changes required to application code

### Impact

- **Type Safety**: Full TypeScript coverage across backend and scripts eliminates runtime type errors
- **Configuration**: Single JSON file replaces scattered `.env` files for cleaner configuration management
- **Cross-Platform**: Removal of PowerShell scripts enables development on any OS
- **Maintainability**: TypeScript provides better IDE support, refactoring, and documentation
- **Security**: JSON config with auto-generated keys ensures secure defaults

## [1.7.0] - 2025-11-27

### Added

- **Keyboard Shortcuts System**
    - New `KeyboardShortcutsModal.tsx` component for displaying available shortcuts
    - New `useKeyboardShortcuts.ts` hook for keyboard shortcut handling
    - New `KeyboardShortcutsContext.tsx` for global keyboard shortcut state management

- **Lazy Loading Components**
    - New `LazyChart.tsx` component for lazy-loaded chart rendering
    - New `LazyModal.tsx` component for lazy-loaded modal dialogs

- **Frontend Testing Infrastructure**
    - New `frontend/src/test/` directory with test utilities
    - `test-query-client.ts` for React Query testing
    - `setup.ts` for test environment configuration
    - `test-utils.tsx` for common test utilities

- **Backend Service Modularization**
    - New `backend/src/services/auth/` directory with modular auth services:
        - `tokenService.js` - JWT token management
        - `emailService.js` - Email notifications for auth events
        - `passwordResetService.js` - Password reset flow handling
        - `demoAccountService.js` - Demo account management
    - New `backend/src/services/websocket/` directory:
        - `rateLimiter.js` - WebSocket rate limiting
        - `connectionManager.js` - WebSocket connection management
        - `config.js` - WebSocket configuration
        - `broadcaster.js` - Event broadcasting
        - `authMiddleware.js` - WebSocket authentication
    - New `backend/src/services/user/` directory:
        - `userStatistics.js` - User statistics calculations
        - `resetTokenService.js` - Password reset token management
        - `passwordService.js` - Password hashing and validation
        - `userQueries.js` - User database queries
        - `userValidation.js` - User input validation
        - `userAudit.js` - User action auditing
    - New `backend/src/services/health-check/` directory:
        - `statisticsService.js` - Health check statistics
        - `config.js` - Health check configuration
        - `cleanupService.js` - Health check data cleanup
        - `checks.js` - Individual health check implementations
        - `alertService.js` - Health check alerting
    - New `backend/src/services/notification/` directory:
        - `notificationPreferences.js` - User notification preferences
        - `notificationBroadcast.js` - Real-time notification broadcasting

- **Prisma Seed Restructuring**
    - New `backend/prisma/seeds/` directory with modular seed files:
        - `framework/` - Core framework seeds (users, settings, notifications, metrics)
        - `app/` - Application-specific seeds

- **Security Enhancements**
    - New `keyManagementService.js` for secure key management
    - New `securityEmailService.js` for security-related email notifications
    - New `authSecurityService.js` for authentication security operations

- **Frontend Page Components**
    - New `frontend/src/pages/users/` directory with modular user management:
        - `UserTable.tsx`, `UserEditModal.tsx`, `UserCreateModal.tsx`, `types.ts`
    - New `frontend/src/pages/login/` directory:
        - `LoginForm.tsx`, `LoginErrorDisplay.tsx`, `DemoAccountSelector.tsx`, `types.ts`
    - New `frontend/src/pages/profile/` directory:
        - `PersonalInfoTab.tsx`, `PreferencesTab.tsx`, `ChangePasswordModal.tsx`, `types.ts`

- **CI/CD Improvements**
    - New `docker-smoke.yml` GitHub Actions workflow for Docker smoke testing
    - Updated `ci.yml` and `docker-publish.yml` workflows

- **Development Scripts**
    - New `scripts/wait-for-http.js` for waiting on HTTP endpoints
    - New `scripts/smoke.json` configuration for smoke tests
    - Updated `scripts/dev-with-logs.js` for enhanced development logging

### Changed

- **Backend Architecture Refactoring**
    - Refactored `app.js` to use modular configuration loading
    - Split backend configuration into separate modules:
        - `config/configLoader.js` - Configuration loading
        - `config/environment.js` - Environment variable handling
        - `config/middleware.js` - Express middleware setup
        - `config/routes.js` - Route registration
        - `config/database.js` - Database configuration
        - `config/server.js` - Server startup
        - `config/shutdown.js` - Graceful shutdown handling
        - `config/services.js` - Service initialization
        - `config/healthEndpoint.js` - Health endpoint configuration
        - `config/errorHandlers.js` - Error handling middleware

- **Frontend TypeScript Configuration**
    - Updated `tsconfig.json`, `tsconfig.build.json`, `tsconfig.app.json`, `tsconfig.node.json`
    - Improved type safety and build configuration

- **Docker Configuration**
    - Updated `docker-compose.yml` and `docker-compose.production.yml`
    - Updated `Dockerfile` for improved build process
    - Updated `docker/start.sh` and `docker/supervisord.conf`
    - Updated `docker/nginx.conf` for improved routing

- **Database Schema**
    - Updated `schema.prisma` with new migrations
    - Added notification preferences and metric indexes migration

- **Settings Components**
    - Updated `EmailSettings.tsx`, `AuthenticationSettings.tsx`, `ApplicationApiSettings.tsx`
    - Updated `SystemHealthSettings.tsx`, `EnhancedNotificationSettings.tsx`
    - Updated `HealthCheckAlerts.tsx`, `HealthCheckStatistics.tsx`
    - Updated `AuditLogsContent.tsx`, `SettingsLayout.tsx`

- **Core Frontend Components**
    - Updated `App.tsx`, `Navigation.tsx`, `Dashboard.tsx`
    - Updated `Login.tsx`, `Users.tsx`, `Roles.tsx`, `Profile.tsx`
    - Updated `Settings.tsx`, `Notifications.tsx`
    - Updated `ResetPassword.tsx`, `ResetPasswordToken.tsx`

- **Backend Services**
    - Updated `authService.js`, `userService.js`, `websocketService.js`
    - Updated `healthCheckService.js`, `settingsService.js`
    - Updated `notificationService.js`, `systemMetricsService.js`
    - Updated `auditService.js`, `passwordPolicyService.js`
    - Updated `authorizationService.js`, `tokenCleanupService.js`

- **Backend Controllers**
    - Updated `authController.js`, `userController.js`, `settingsController.js`
    - Updated `notificationController.js`, `auditLogController.js`
    - Updated `roleController.js`, `healthCheckController.js`
    - Updated `dataController.js`, `userSecurityController.js`

- **Backend Routes**
    - Updated `authRoutes.js`, `userRoutes.js`, `settingsRoutes.js`
    - Updated `notificationRoutes.js`, `roleRoutes.js`, `dataRoutes.js`
    - Updated `dashboardRoutes.js`

- **Backend Middleware**
    - Updated `auth.js`, `authorization.js`, `validation.js`
    - Updated `auditMiddleware.js`, `apiKeyAuth.js`
    - Updated `requestId.js`, `combinedAuth.js`

- **Backend Utilities**
    - Updated `logger.js`, `security.js`, `pagination.js`
    - Updated `apiKeys.js`, `database.js`, `slug.js`, `cache.js`

- **Frontend Services**
    - Updated `api.ts`, `authService.ts`, `usersService.ts`
    - Updated `roleService.ts`, `notificationService.ts`

- **Frontend Hooks**
    - Updated `useAuth.ts`, `useWebSocket.ts`, `useUserSettings.ts`
    - Updated `useAuthorization.ts`, `useEmailConfig.ts`

- **Frontend Contexts**
    - Updated `AuthContext.tsx`, `WebSocketContext.tsx`

- **Configuration Files**
    - Updated `vite.config.ts`, `vitest.config.ts`
    - Updated `tailwind.config.js`, `eslint.config.js`
    - Updated `knip.json` for dead code detection
    - Updated `backend/src/config/defaults.json`
    - Updated `config/spernakit.json`

- **Version Management**
    - Bumped version from 1.6.4 to 1.7.0 across all package.json files
    - Updated `scripts/setup.js` fallback version to 1.7.0

### Impact

- **Architecture**: Major backend modularization improves maintainability and testability
- **Developer Experience**: Enhanced keyboard shortcuts, lazy loading, and development tooling
- **Security**: Improved key management and security email notifications
- **Testing**: New frontend testing infrastructure enables comprehensive component testing
- **CI/CD**: Docker smoke testing ensures deployment reliability
- **Performance**: Lazy-loaded components reduce initial bundle size

## [1.6.4] - 2025-10-24

### Changed

- **Performance Optimizations**
    - Reduced Docker healthcheck frequency from 30s to 2m for both backend and frontend services
    - Increased system metrics collection interval from 10s to 60s (83% reduction in log noise)
    - Adjusted memory threshold for health endpoint from 90% to 95% (critical) and 75% to 85% (warning)
    - Added explicit `root` configuration to Vite config to fix build path resolution in monorepo workspaces

- **Build System**
    - Fixed Vite build errors when running from workspace root by adding `root: __dirname` configuration
    - Improved build reliability for multi-project workspaces with junction points/symlinks

### Impact

- **Monitoring**: ~80% reduction in routine health check and metrics log volume
- **Reliability**: Fewer false 503 errors from health endpoint (now triggers at 95% memory instead of 90%)
- **Build**: Resolved path resolution issues preventing successful builds in monorepo setups
- **Docker**: Reduced container overhead from frequent health checks while maintaining adequate monitoring

## [1.6.3] - 2025-10-23

### Added

- **Documentation**
    - New codemap: `docs/codemaps/Spernakit_Build_System_and_Linting_Configuration.md` (795 lines)
    - Comprehensive documentation of build scripts, configuration files, and linting rules
    - Covers project initialization, development server startup, production build pipeline, code quality enforcement, Docker containerization, and build optimization

### Changed

- **Dependency Updates**

- **Environment Configuration**
    - Updated configuration documentation to reflect correct default port (3330 instead of 5173)

- **Setup Script**
    - Updated default version fallback in `scripts/setup.js` from 1.6.2 to 1.6.3

### Impact

- **Security**: Latest dependency versions include security patches and bug fixes
- **Compatibility**: Updated Prisma client ensures database compatibility
- **Documentation**: New codemap provides comprehensive build system reference
- **Development**: Corrected environment example prevents confusion about default ports

## [1.6.2] - 2025-10-20

### Fixed

- Regression: backend containers were not receiving AUTH_COOKIE_NAME at runtime, causing cross-app cookie collisions on localhost and "invalid signature" errors. docker-compose.yml now passes AUTH_COOKIE_NAME to backend services for all apps.

### Changed

- Unified validation gate now enforces AUTH_COOKIE_NAME presence and rejects generic names ("token", "auth", "session", "undefined") to ensure uniqueness per app.
- Proactive auth hardening: middleware clears the AUTH_COOKIE_NAME cookie on verification failure (401) to prevent repeated failures from stale/foreign tokens.

### Impact

- Security: Eliminates cross-app cookie clashes; enforces unique per-app cookie naming.
- UX: Users are prompted to re-authenticate immediately instead of being stuck in 401 loops.

## [1.6.1] - 2025-10-20

### Changed

- **Environment Configuration**
    - Configuration is managed via JSON config files (`config/{appname}.json`)
    - Scripts and runtime load JSON config and populate `process.env` for compatibility

- **Frontend Build Process**
    - Implemented Docker BuildKit secrets for VITE\_\* environment variables
    - Only public VITE\_\* variables exposed to frontend build (no secrets in image layers)
    - Removed ARG/ENV defaults from frontend Dockerfiles
    - Added fail-fast validation in vite.config.ts for required VITE_API_URL

- **Backend Startup**
    - Added fail-fast PORT validation in app.js
    - Clear error messages if PORT is missing or invalid (1-65535 range)
    - Exits immediately on startup if required env vars not set

- **Frontend Entrypoints**
    - Added comprehensive NGINX_PORT validation guards
    - Validates presence, numeric type, and valid port range (1-65535)
    - Fails with clear error message before nginx starts

### Impact

- **Configuration Management**: No more scattered defaults; JSON config is the single source of truth
- **Security**: Secrets never baked into Docker image layers via BuildKit secrets
- **Reliability**: Fail-fast behavior prevents silent configuration errors
- **Maintainability**: Port and env values maintained in one place only

## [1.6.0] - 2025-10-19

### Changed

- Homogenized Prisma schemas across all apps; standardized CORE section order:
  AUDITING → HEALTH CHECKS → NOTIFICATIONS → SETTINGS → SYSTEM METRICS → USERS.
- Removed all traces of Schema Versioning across apps.

### Fixed

- WebSocket authentication cookie mismatch: Socket.io handshake now respects AUTH_COOKIE_NAME per app; resolves "Authentication required - no access cookie" indicator.

### Notes

- No breaking changes expected. Recommend `bunx prisma validate` in each backend as a sanity check.

## [1.5.9] - 2025-10-17

### Changed

- Authentication stability across all apps: cross-tab auth sync (BroadcastChannel with fallback), focus/visibility revalidation, and 5‑minute visible‑only keep‑alive.
- Cookie isolation: distinct per‑app auth cookie names on localhost to prevent collisions when switching between apps.
- TypeScript/ESLint cleanup: ambient BroadcastChannel typings; removed `any` casts; addressed react-hook-form watch warnings by using `useWatch`.

### Notes

- No breaking changes. All apps lint, format, and build cleanly.

## [1.5.8] - 2025-01-14

### Added

- **Health Check System - Complete Implementation**
    - Automated health monitoring service with configurable intervals (default: 5 minutes)
    - Five built-in health checks: Database, Memory, Filesystem, Authentication, WebSocket
    - Comprehensive logging system with HealthCheckLog database table
    - Alert management system with HealthCheckAlert database table
    - Automated cleanup service (runs daily at 2 AM, 30-day retention default)
    - Real-time health status dashboard in Settings → System Health
    - Alert acknowledgment and resolution workflow
    - Historical statistics and trend analysis
    - Core Web Vitals monitoring (LCP, FID, CLS, TTFB, INP, FCP)
    - 8 API endpoints: `/results`, `/alerts`, `/acknowledge`, `/resolve`, `/run`, `/statistics`, `/restart`, `/cleanup`
    - Role-based access control (ADMIN/SYSOP required)
    - Graceful service lifecycle management (start/stop with application)
    - Documentation: `docs/advanced/HEALTH_CHECK_SYSTEM.md`

- **Health Check Configuration**
    - 14 environment variables for complete customization
    - Configurable thresholds for all health checks (warning and critical levels)
    - Enable/disable individual checks or entire system
    - Adjustable alert notifications and data retention
    - Example configuration in `config/{appname}.json`

- **Health Check UI Components**
    - `HealthCheckAlerts.tsx` - Alert management interface (156 lines)
    - `HealthCheckStatistics.tsx` - Historical statistics dashboard (317 lines)
    - Enhanced `SystemHealthSettings.tsx` - Unified health monitoring interface
    - Real-time status updates with color-coded indicators
    - Responsive design with DaisyUI components
    - Always displays all 6 Core Web Vitals cards with pending states

- **Database Schema Updates**
    - Added `HealthCheckLog` model with indexed fields for efficient querying
    - Added `HealthCheckAlert` model with status tracking and acknowledgment
    - Migration: `20251014203012_add_health_check_system`
    - Migration: `20250114000000_rename_error_to_critical` (status terminology update)

### Changed

- **SystemHealthSettings Component**
    - Removed props-based architecture (no longer requires `settings`, `onUpdateSetting`, `isLoading`)
    - Now self-contained with internal data fetching using TanStack Query
    - Improved Core Web Vitals display - always shows all 6 metrics
    - Better pending state handling for metrics requiring user interaction
    - Reduced component complexity from 600+ lines to 250 lines

- **Settings Page Integration**
    - Simplified `SystemHealthSettings` component usage (no props required)
    - Cleaner component composition in Settings.tsx
    - Better separation of concerns

- **Application Lifecycle**
    - Added health check service initialization in `app.js`
    - Added health check cleanup service initialization
    - Enhanced graceful shutdown to stop health check services
    - Added `/api/health-checks` route registration

### Fixed

- **Core Web Vitals Display**
    - Fixed inconsistent card display (sometimes showing only 2-3 cards)
    - Now always displays all 6 Core Web Vitals cards
    - Clear pending states for unavailable metrics
    - Helpful context messages ("Needs interaction" for INP/CLS, "Pending" for others)

### Performance

- **Health Check System**
    - Efficient database queries with proper indexing
    - Configurable check intervals to balance monitoring vs. performance
    - Automated cleanup prevents database bloat
    - Minimal overhead on application performance

### Security

- **Health Check Endpoints**
    - All endpoints require authentication
    - ADMIN or SYSOP role required for all operations
    - Secure alert acknowledgment tracking (records user who acknowledged)
    - Audit trail for all health check operations

### Documentation

- **New Documentation**
    - `docs/advanced/HEALTH_CHECK_SYSTEM.md` - Complete system documentation (558 lines)
    - Comprehensive API reference for all 8 endpoints
    - Configuration guide with all environment variables
    - Architecture overview and component descriptions
    - Troubleshooting guide and best practices

### Migration Notes

- **Database Migrations Required**
    - Run ` prisma migrate deploy` to apply health check schema
    - Two migrations: status terminology update and health check system
    - No breaking changes to existing data

- **Environment Configuration**
    - Add health check configuration to `config/{appname}.json`
    - All settings have sensible defaults
    - System can be disabled with `HEALTH_CHECK_ENABLED=false`

- **Backward Compatibility**
    - All changes are backward compatible
    - Health check system is optional (can be disabled)
    - No changes to existing API endpoints or functionality

### Homogenization

- **Applied to All Spernakit-Based Apps**
    - Taskboard (Kanban board)
    - Report-portal (Reporting & analytics)
    - Scheduler (Task scheduling)
    - Timeline-app (Timeline & events)
    - All apps now have identical health check infrastructure
    - Consistent monitoring across all applications

## [1.5.7] - 2025-10-14

### Added

- **Performance Improvements - Resource Hints**
    - Added preconnect and dns-prefetch directives for backend API in all 5 apps
    - Reduces first API call latency by 100-300ms
    - Strategic placement after Google Fonts preconnect
    - Documentation: See `docs/template/advanced/PERFORMANCE.md`

- **Performance Improvements - Image Optimization**
    - Created comprehensive `scripts/optimize-images.ts` for WebP conversion
    - Generates responsive image variants (320w, 640w, 1024w, 1280w)
    - Added npm scripts: `optimize-images`, `optimize-images:dry-run`, `optimize-images:force`
    - Installed sharp@0.34.4 as dev dependency
    - Expected 30-40% image size reduction and 200-500ms LCP improvement
    - Documentation: See `docs/template/advanced/PERFORMANCE.md`

- **Performance Improvements - Code Splitting**
    - Implemented lazy loading for Settings page components using React.lazy()
    - Added Suspense boundaries with consistent loading UI
    - Converted 7 components to on-demand loading (AuthenticationSettings, EmailSettings, EnhancedNotificationSettings, SystemHealthSettings, AuditLogsContent, UsersPage, RolesPage)
    - Reduced main bundle size by 15-20% (~100-150 KB)
    - Expected 50-100ms TTI improvement
    - Documentation: See `docs/template/advanced/PERFORMANCE.md`

- **Performance Improvements - SystemHealthSettings Optimization**
    - Implemented stale-while-revalidate caching pattern
    - Deferred Web Vitals loading to prioritize critical UI
    - Memoized health checks computation
    - Optimized React Query configuration with proper staleTime and gcTime
    - Documentation: See `docs/template/advanced/PERFORMANCE.md`

- **Performance Improvements - Skeleton Loaders**
    - Created `DashboardSkeleton.tsx` component for Dashboard page
    - Created `UserTableSkeleton.tsx` component for Users page
    - Prevents Cumulative Layout Shift (CLS) during data loading
    - Matches actual content layout for seamless transitions
    - Documentation: See `docs/template/advanced/PERFORMANCE.md`

- **Performance Improvements - Font Optimization**
    - Optimized Google Fonts loading by reducing weights from 100-900 to 400, 500, 600, 700
    - Added latin subset parameter to reduce font file size
    - Implemented font-display: swap to prevent FOIT (Flash of Invisible Text)
    - Expected 40-60% font file size reduction and 0-300ms FCP improvement
    - Comprehensive fallback font stack for immediate text rendering
    - Documentation: See `docs/template/advanced/PERFORMANCE.md`

- **Health Check System Planning**
    - Created comprehensive implementation plan: `IMP_HEALTHCHECK.md`
    - Designed 9-phase implementation for complete health monitoring system
    - Planned database schema for HealthCheckLog and HealthCheckAlert tables
    - Designed scheduled health checks, alerting, and data retention features
    - 5-day implementation timeline with detailed technical specifications

- **Documentation**
    - Created `docs/template/advanced/PERFORMANCE.md` master tracking document
    - Created 6 detailed implementation documents for each performance improvement
    - Updated Lighthouse audit results: `LIGHTHOUSE_REVIEW_2025-10-14.md`
    - Comprehensive testing recommendations and expected impact metrics

### Changed

- **Frontend Performance**
    - Optimized Settings page with lazy-loaded components
    - Improved Dashboard and Users pages with skeleton loaders
    - Enhanced SystemHealthSettings with advanced caching strategies
    - Deferred non-critical Web Vitals loading

- **Build Configuration**
    - Added sharp@0.34.4 to devDependencies for image optimization
    - Added image optimization scripts to package.json
    - Moved `generate-favicons.js` from frontend/scripts to root scripts directory

- **Font Loading Strategy**
    - Changed from loading all font weights (100-900) to selective weights (400, 500, 600, 700)
    - Added latin subset to Google Fonts URL
    - Enhanced font preloading with async loading pattern

### Performance Impact Summary

- **Bundle Size**: Reduced by 15-20% (~100-150 KB) through code splitting
- **Font Files**: Reduced by 40-60% through weight optimization and subsetting
- **Image Files**: Expected 30-40% reduction through WebP conversion
- **First API Call**: 100-300ms faster with resource hints
- **LCP (Largest Contentful Paint)**: 200-500ms improvement on image-heavy pages
- **FCP (First Contentful Paint)**: 0-300ms improvement from font optimization
- **TTI (Time to Interactive)**: 50-100ms improvement from code splitting
- **CLS (Cumulative Layout Shift)**: Eliminated with skeleton loaders

### Technical Debt

- Health Check Configuration UI is currently non-functional (settings stored but not enforced)
- Implementation plan created but not yet executed
- Requires backend service implementation, API endpoints, and frontend integration

## [1.5.6] - 2025-10-14

### Fixed

- Minor version bump for consistency

## [1.5.5] - 2025-10-13

### Added

- **JSDoc Documentation Standards**
    - Created comprehensive `docs/standards/JSDOC_STANDARDS.md` with templates and guidelines
    - Documented all 8 controllers with method-level JSDoc (39+ methods)
    - Documented userService with comprehensive method documentation (7 key methods)
    - Achieved 90%+ documentation coverage across controllers and key services
    - Enhanced IDE support with type annotations and parameter hints
    - Established documentation density targets (15-20% controllers, 20-25% services)

- **Architecture Audit Documentation**
    - Created 12 comprehensive audit reports and resolution summaries (5,571 lines)
    - `ARCHITECTURE_AUDIT_REPORT_2025-01-13.md` - Backend architecture analysis
    - `CODE_QUALITY_AUDIT_REPORT_2025-01-13.md` - Code quality metrics
    - `DATA_ARCHITECTURE_AUDIT_REPORT_2025-01-13.md` - Database schema analysis
    - `FRONTEND_AUDIT_REPORT_2025-01-13.md` - Frontend architecture review
    - `SECURITY_AUDIT_REPORT_2025-01-13.md` - Security posture assessment
    - Issue-specific resolution summaries for Issues #1-4

- **Service Layer Modularization (Issue #2)**
    - Created `backend/src/services/security/accountLockout.js` (238 lines)
    - Created `backend/src/services/security/securityMonitoring.js` (157 lines)
    - Created `backend/src/services/security/sessionManagement.js` (70 lines)
    - Created `backend/src/services/notification/notificationBroadcast.js` (161 lines)
    - Created `backend/src/services/notification/notificationPreferences.js` (100 lines)
    - Created `backend/src/services/user/userAudit.js` (116 lines)
    - Created `backend/src/services/user/userValidation.js` (168 lines)

- **Role Management Consolidation (Issue #3)**
    - Added `ROLE_MANAGEMENT_RULES` to `constants/permissions.js` as single source of truth
    - Added `canManageRole()` helper function for role permission checks
    - Fixed critical bug: ADMIN users can now manage MANAGER users

### Changed

- **Service Refactoring (Issue #2)**
    - Refactored `accountSecurityService.js` from 406 lines to focused security modules
    - Refactored `notificationService.js` from 208 lines to focused notification modules
    - Refactored `userService.js` from 366 lines with improved separation of concerns
    - Improved modularity and single responsibility principle adherence

- **Role Validation Simplification (Issue #3)**
    - Simplified `userValidation.js` using permission matrix pattern
    - Reduced cyclomatic complexity from 15 to 3
    - Eliminated duplicate role permission logic (3 sources → 1 source of truth)
    - Improved maintainability and reduced potential for permission bugs

- **Controller Documentation (Issue #4)**
    - Enhanced `authController.js` with 6 method JSDoc blocks
    - Enhanced `userController.js` with 5 method JSDoc blocks
    - Enhanced `dataController.js` with 8 method JSDoc blocks (5 public + 3 private)
    - Enhanced `notificationController.js` with 11 method JSDoc blocks
    - Enhanced `settingsController.js` with 9 function JSDoc blocks

### Fixed

- **Notification Routes (Issue #1)**
    - Fixed missing SMTP configuration routes in `settingsRoutes.js`
    - Added `/api/settings/email-config` route
    - Added `/api/settings/smtp/config` route
    - Added `/api/settings/smtp/test` route

- **Role Management Bug (Issue #3)**
    - Fixed ADMIN role unable to manage MANAGER users
    - Consolidated conflicting role permission definitions
    - Established single source of truth in `constants/permissions.js`

### Documentation

- **Standards**
    - `docs/standards/JSDOC_STANDARDS.md` - Comprehensive JSDoc guidelines (469 lines)

- **Audit Reports**
    - `docs/audits/ARCHITECTURE_AUDIT_REPORT_2025-01-13.md` (466 lines)
    - `docs/audits/CODE_QUALITY_AUDIT_REPORT_2025-01-13.md` (451 lines)
    - `docs/audits/DATA_ARCHITECTURE_AUDIT_REPORT_2025-01-13.md` (440 lines)
    - `docs/audits/FRONTEND_AUDIT_REPORT_2025-01-13.md` (558 lines)
    - `docs/audits/SECURITY_AUDIT_REPORT_2025-01-13.md` (491 lines)

- **Resolution Summaries**
    - `docs/audits/ISSUE_1_HOTFIX_NOTIFICATION_ROUTES.md` (129 lines)
    - `docs/audits/ISSUE_1_RESOLUTION_SUMMARY.md` (201 lines)
    - `docs/audits/ISSUE_2_RESOLUTION_SUMMARY.md` (289 lines)
    - `docs/audits/ISSUE_3_RBAC_ANALYSIS.md` (344 lines)
    - `docs/audits/ISSUE_3_RESOLUTION_SUMMARY.md` (265 lines)
    - `docs/audits/ISSUE_4_COMPLETE.md` (317 lines)
    - `docs/audits/ISSUE_4_RESOLUTION_SUMMARY.md` (391 lines)
    - `docs/audits/OPTION_A_IMPLEMENTATION_SUMMARY.md` (342 lines)

### Metrics

- **Code Quality**
    - Documentation coverage: 30% → 90%+
    - Comment density: 10% → 17-22%
    - Cyclomatic complexity (role validation): 15 → 3
    - Service modularity: Improved separation of concerns
    - Files modified: 34 files
    - Lines added: +6,655
    - Lines removed: -916
    - Net change: +5,739 lines

- **Testing**
    - ✅ All linting passes (0 errors, 0 warnings)
    - ✅ No breaking changes to existing functionality
    - ✅ Backward compatible with existing implementations

## [1.5.4] - 2025-10-13

### Added

- **Notification Preferences System - Full Enforcement**
    - Implemented complete backend enforcement of user notification preferences
    - Added `getUserNotificationPreferences()` method to NotificationService
    - Added `shouldSendNotification()` method with type-specific preference checking
    - Added `shouldSendSecurityEmail()` method to SecurityEmailService
    - Notification preferences now control: SYSTEM, SECURITY, MARKETING, and general notifications
    - Critical security notifications (account locked, unlocked) bypass preferences for safety
    - Non-critical notifications (password expiration, system updates) respect user preferences
    - Broadcast methods (`broadcastToRole`, `broadcastToAll`) now filter users by preferences
    - Comprehensive logging of blocked notifications for debugging and analytics
    - Returns blocked count in broadcast responses for monitoring

- **Profile Page - Notification Preferences Loading**
    - Added `useQuery` to fetch notification preferences from database on page load
    - Added `useEffect` to populate form with user's saved preferences
    - Notification preferences now display actual saved values instead of hardcoded defaults
    - Form automatically updates when preferences are saved

- **Profile Page - Password Change Modal**
    - Added fully functional password change modal component
    - Includes three password fields: current password, new password, confirm password
    - Client-side validation:
        - Current password required
        - New password minimum 8 characters
        - Passwords must match
        - New password must differ from current password
    - Server-side validation via `/auth/change-password` API endpoint
    - Success/error toast notifications
    - Form resets on successful password change
    - Loading state during submission
    - Modal closes on backdrop click or Cancel button
    - Proper autocomplete attributes for password managers
    - "Change Password" button in Profile → Security now opens the modal

- **Documentation**
    - Created `docs/advanced/NOTIFICATION_PREFERENCES.md` with comprehensive technical guide
    - Covers user-facing features, technical architecture, storage format, backend implementation
    - Includes usage examples, testing scenarios, and best practices
    - Documents critical vs non-critical notification types
    - Explains preference enforcement logic and logging

### Changed

- **NotificationService Backend**
    - Updated `createNotification()` to check preferences before creating notifications
    - Added `isCritical` parameter to bypass preferences for security-critical events
    - Updated `createSystemNotification()` to use type `SYSTEM` instead of `INFO`
    - Updated `createTaskNotification()`, `createSystemNotification()`, `createWelcomeNotification()` to support `isCritical` parameter
    - Broadcast methods now return `{ count, blocked, data }` with blocked notification count

- **SecurityEmailService Backend**
    - Updated `sendAccountLockedEmail()` to mark as critical (always sent)
    - Updated `sendPasswordExpiredEmail()` to respect preferences (non-critical)
    - Updated `sendAccountUnlockedEmail()` to mark as critical (always sent)
    - All security email methods now check preferences before sending

- **Profile Page Tab Highlighting**
    - Fixed active tab highlighting on Profile page
    - Changed from `useParams()` to `useLocation()` with regex pattern matching
    - Now correctly highlights active tab based on URL path
    - Matches Settings page implementation pattern

- **Profile Page Preferences Form**
    - Improved spacing between form fields (gap-4 → gap-6, space-y-4 → space-y-6)
    - Standardized field ordering across all applications:
        1. Theme (System/Light/Dark)
        2. App Theme (Visual theme variants)
        3. Layout (Centered/Full Width)
        4. Language (English/Español/Français/Deutsch)
        5. Timezone (UTC/Regional options)
        6. Date Format (YYYY-MM-DD/MM/DD/YYYY/etc.)
        7. Time Format (24 Hour/12 Hour)
        8. Items Per Page (10/25/50/100)

### Removed

- **Settings Page - Monitoring Tab**
    - Removed non-functional Monitoring settings page
    - Removed `ChartBarIcon` import
    - Removed "Monitoring" tab from Settings navigation
    - Removed `/settings/monitoring` route
    - Removed `MonitoringSettings` component (133 lines)
    - Backend did not use monitoring settings, so removal improves UI clarity

### Fixed

- **Profile → Notifications Page**
    - Fixed critical issue where notification preferences were not loading from database
    - Preferences now correctly display user's saved settings instead of hardcoded defaults
    - Users can now see their actual notification preferences when visiting the page

- **Profile → Security Page**
    - Fixed non-functional "Change Password" button
    - Button now opens a fully functional password change modal
    - Users can now change their password directly from the Profile page

### Impact

- **User Experience**: Users can now effectively control which notifications they receive
- **Security**: Critical security notifications always sent regardless of preferences
- **Privacy**: Users have granular control over notification types (system, security, marketing)
- **Functionality**: Profile page now fully functional with working password change and preference loading
- **Code Quality**: Cleaner Settings page without non-functional features
- **Maintainability**: Comprehensive documentation for notification preferences system
- **Monitoring**: Blocked notification counts available for analytics and debugging

### Technical Details

**Notification Preference Types**:

- `emailNotifications` - Master toggle for all email notifications
- `systemAlerts` - Controls SYSTEM type notifications
- `securityAlerts` - Controls non-critical SECURITY notifications
- `marketingEmails` - Controls MARKETING type notifications

**Critical Notifications** (always sent):

- Account locked
- Account unlocked by admin
- Password reset requests (if implemented)

**Non-Critical Notifications** (respect preferences):

- Password expiration warnings
- System maintenance notices
- Feature announcements
- Profile update confirmations
- Welcome notifications

**API Endpoints**:

- `GET /api/settings/notifications` - Fetch notification preferences
- `PUT /api/settings/notifications` - Update notification preferences
- `POST /api/auth/change-password` - Change user password

## [1.5.3] - 2025-10-05

### Added

- **Docker Database Initialization Script**
    - New `docker/init-db.sh` shell script for automated database setup in Docker environments
    - Provides clear step-by-step output during initialization process
    - Runs Prisma client generation, migrations, and seeding in proper sequence
    - Improved error handling with `set -e` to fail fast on errors

- **Production Database Migration Support**
    - Added `db:migrate:deploy` script to backend package.json
    - Uses `prisma migrate deploy` for production-safe migrations
    - Applies pending migrations without prompting or creating new migrations
    - Essential for Docker and production deployments

- **WebSocket Support in Nginx**
    - Added `/ws` location block in nginx.conf for native WebSocket proxying
    - Proper WebSocket upgrade headers configuration
    - Extended proxy read timeout (86400s) for long-lived WebSocket connections
    - Enables real-time features in production Docker deployments

- **Enhanced Docker Compose Configuration**
    - Added `FRONTEND_PORT` environment variable to backend service
    - Added `TRUST_PROXY=true` environment variable for proper proxy handling
    - Improved database-init service dependency with `condition: service_completed_successfully`
    - Added volume mounts for migrations directory and init script

### Changed

- **Node.js Version Upgrade**
    - Updated Docker base images from `node:20-alpine` to `node:24-alpine`
    - Updated deployment documentation to reflect Node.js 24 requirement
    - Ensures compatibility with latest Node.js LTS features

- **Docker Security Enhancements**
    - Added `dumb-init` to both frontend and backend Dockerfiles
    - Added `apk update && apk upgrade` for security patches in base images
    - Improved process signal handling in containers

- **Backend Proxy Configuration**
    - Added `trust proxy` setting to Express app for Docker/nginx environments
    - Enables proper client IP detection from `X-Forwarded-For` headers
    - Required for rate limiting and audit logging behind reverse proxies
    - Configurable via `TRUST_PROXY` environment variable (defaults to enabled)

- **CORS Configuration Enhancement**
    - Updated CORS middleware comments to clarify Docker internal request handling
    - Allows requests without origin header for nginx proxy requests
    - Maintains security while supporting Docker networking

- **Settings Routes Authentication**
    - Changed `/api/settings/email-config` endpoint from `authenticate` to `optionalAuth`
    - Allows unauthenticated users to check if password reset is available
    - Enables login page to conditionally show "Forgot Password" link
    - Improves user experience for password recovery

- **Docker Compose Host Configuration**
    - Changed backend `HOST` environment variable from `${BACKEND_HOST}` to `${HOST:-0.0.0.0}`
    - Provides sensible default for Docker networking
    - Simplifies environment configuration

- **Database Initialization Process**
    - Replaced inline command in docker-compose.yml with dedicated init script
    - Added `NODE_ENV` environment variable to database-init service
    - Mounted migrations directory and init script as volumes
    - Improved reliability and maintainability of initialization process

### Fixed

- **Frontend Favicon Reference**
    - Removed broken `/vite.svg` favicon link from index.html
    - Added comment instructing users to add their own favicon to `/public` directory
    - Prevents 404 errors on favicon requests

### Documentation

- **Updated Deployment Guide**
    - Updated Node.js version reference from 20 to 24 in deployment examples
    - Reflects current Docker base image versions

### Impact

- **Production Readiness**: Enhanced Docker deployment with proper WebSocket support and database migrations
- **Security**: Improved proxy handling and security patches in Docker images
- **Reliability**: Better database initialization process with clear error handling
- **User Experience**: Password reset availability check on login page
- **Maintainability**: Cleaner Docker configuration with dedicated initialization script

## [1.5.2] - 2025-10-04

### Added

- **Security Key Generation Documentation**
    - Comprehensive `docs/SECURITY_KEY_GENERATION.md` guide (201 lines)
    - Detailed instructions for generating and managing cryptographic keys
    - Best practices for key rotation in development and production
    - Troubleshooting guide for common key-related issues
    - Explanation of single-quote wrapping for special characters in keys

- **Docker Support**
    - Complete Docker containerization for production deployment
    - Multi-stage Docker builds for optimized image sizes
    - `docker-compose.yml` for orchestrating backend and frontend services
    - Nginx reverse proxy configuration for production
    - Docker-specific documentation in `docker/README.md` (255 lines)
    - Port configuration guide in `docker/PORT-CONFIGURATION.md` (187 lines)
    - Frontend entrypoint script for dynamic configuration
    - `.dockerignore` for optimized build contexts
    - Docker commands in package.json: `docker:build`, `docker:up`, `docker:down`, `docker:logs`

- **Contributing Guidelines**
    - Code of conduct and community standards
    - Development process and workflow documentation
    - Code standards and testing guidelines
    - Pull request and commit message conventions

- **Password Policy Documentation**
    - Comprehensive `docs/PASSWORD_POLICY.md` guide (225 lines)
    - Detailed explanation of password requirements and validation
    - User experience guidelines for password creation and updates
    - Technical implementation details for frontend and backend
    - Real-time validation and strength indicator documentation

- **Enhanced Security Checks**
    - Production-only security validation on application startup
    - Automatic exit if required secrets are missing or unsafe in production
    - Key management service initialization during app startup
    - Validation for JWT_SECRET, ENCRYPTION_KEY, and COOKIE_SECRET

- **Improved User Management UI**
    - Enhanced password strength indicator in Users page
    - Real-time validation feedback during user creation
    - Conditional form validation for password updates
    - Better error messaging for password policy violations

### Changed

- **Key Generation Script**
    - Automatic single-quote wrapping for all generated keys
    - Improved handling of special characters in cryptographic keys
    - Enhanced backup creation before key updates
    - Better validation and error messages

- **Environment Configuration**
    - Updated JSON config documentation to reflect correct default port (3330 instead of 5173)
    - Improved documentation for environment variables
    - Clearer guidance on key requirements and formats

- **Seed Data Service**
    - Removed complex `secureSeeding.js` service (369 lines removed)
    - Simplified seed.js for better maintainability
    - Streamlined user seeding process

- **Bundle Analysis Scripts**
    - Removed `scripts/analyze-bundle.js` (287 lines)
    - Removed `scripts/compare-bundle-sizes.js` (140 lines)
    - Simplified build analysis tooling

- **Setup Script**
    - Enhanced `scripts/setup.js` with better key generation integration
    - Improved error handling and user feedback

- **Dependency Updates**
    - Updated frontend dependencies to latest versions
    - Updated backend dependencies for security and performance
    - Updated npm to v11.6.1

### Fixed

- **Key Management**
    - Fixed special character handling in environment variables
    - Resolved shell interpretation issues with `$`, `&`, and other special characters
    - Improved key validation on application startup

- **Security Configuration**
    - Enhanced production security checks
    - Better validation of required secrets
    - Improved error messages for missing or weak keys

- **Vite Configuration**
    - Updated frontend build configuration for better compatibility
    - Improved environment variable handling

### Security

- **Enhanced Key Security**
    - All generated keys now properly wrapped in single quotes
    - Prevents shell interpretation of special characters
    - Improved key strength validation
    - Production-only enforcement of secure key requirements

- **Docker Security**
    - Multi-stage builds minimize attack surface
    - Non-root user execution in containers
    - Secure Nginx configuration
    - Health checks for container monitoring

### Documentation

- **New Documentation Files**
    - `docs/SECURITY_KEY_GENERATION.md` - Complete key management guide
    - `docs/PASSWORD_POLICY.md` - Password requirements and validation
    - `docker/README.md` - Docker deployment documentation
    - `docker/PORT-CONFIGURATION.md` - Port configuration guide

- **Updated Documentation**
    - Enhanced `docs/GETTING_STARTED.md` with key generation instructions
    - Updated README.md with Docker deployment information
    - Improved security documentation references

### Impact

- **Production Readiness**: Docker support enables easy production deployment
- **Security**: Enhanced key management and validation improves security posture
- **Developer Experience**: Better documentation and contributing guidelines
- **Maintainability**: Simplified codebase with removal of unused scripts
- **User Experience**: Improved password policy enforcement and feedback

## [1.5.1] - 2025-10-02

### Changed

- **Documentation Consolidation**
    - Reduced documentation files from 49 to 20 (59% reduction)
    - Consolidated 11 Lighthouse optimization files into single comprehensive guide (`docs/advanced/PERFORMANCE.md`)
    - Archived 18 historical audit files into `docs/audits/HISTORICAL_AUDITS_2025-09.md`
    - Moved `docs/DEVELOPER_GUIDE.md` to `docs/DEVELOPMENT.md` for better organization
    - Removed redundant summary files (compression, minification, lazy loading)
    - Updated all cross-references in `docs/README.md`

### Fixed

- **Build Warnings**
    - Resolved WebSocket dynamic import warning by removing unnecessary lazy loading attempt
    - Changed WebSocketProvider to static import in `App.tsx`
    - Removed ConditionalWebSocketProvider wrapper component
    - Documented CSS @property warning from DaisyUI as expected behavior
    - Switched CSS minifier to esbuild for better modern CSS support

- **Bundle Optimization**
    - Re-enabled lazy loading for Dashboard route (22 KB chunk)
    - Maintained lazy loading for Settings route (106 KB chunk)
    - Kept Login as eager-loaded entry point for unauthenticated users
    - Main bundle reduced by 128.94 KB (58% reduction)

### Added

- **Bundle Analysis Tools**
    - Added `scripts/analyze-bundle.js` for detailed bundle composition analysis
    - Added `scripts/compare-bundle-sizes.js` for before/after comparisons
    - Added npm scripts: `analyze-bundle` and `compare-bundles`

## [1.5.0] - 2025-10-01

### Added - URL-Based Navigation for Settings and Profile

**Settings and Profile pages now support linkable, bookmarkable subpages with URL routing.**

- **URL-Based Tab Navigation**
    - Settings and Profile tabs now use URL parameters instead of local state
    - Each tab has a unique, shareable URL (e.g., `/settings/monitoring`, `/profile/preferences`)
    - Browser back/forward buttons work correctly with tab navigation
    - Page refresh maintains the current tab
    - Tabs can be bookmarked and shared via direct links

- **Nested Routes Implementation**
    - Converted Settings page to use React Router nested routes
    - Converted Profile page to use React Router nested routes
    - Added index routes that redirect to default tabs
    - Updated App.tsx to support wildcard routes (`/settings/*`, `/profile/*`)

- **Reusable SettingsLayout Component**
    - Added `basePath` prop to SettingsLayout for flexibility
    - Component now works with any page (Settings, Profile, or custom pages)
    - Replaced button onClick handlers with Link components
    - Maintains backward compatibility with default `/settings` basePath

- **Available URLs**
    - Settings: `/settings/application`, `/settings/authentication`, `/settings/email`, `/settings/notifications`, `/settings/system`, `/settings/monitoring`, `/settings/security`, `/settings/audit-logs`
    - Profile: `/profile/personal`, `/profile/preferences`, `/profile/security`, `/profile/notifications`

### Changed

- Settings page now uses `useParams` and `useNavigate` instead of `useState` for tab management
- Profile page now uses `useParams` and `useNavigate` instead of `useState` for tab management
- SettingsLayout tabs are now Link components instead of buttons
- Route title matcher updated to handle wildcard routes with `end: false`

### Fixed

- Profile tabs no longer redirect to Settings page
- Tab state persists across page refreshes
- Browser navigation (back/forward) now works correctly with tabs

## [1.5.0] - 2025-10-01

### Added - Authentication Security & Audit Logging

**Comprehensive authentication security enforcement with backend validation and audit logging.**

#### Authentication Security Features

- **Account Lockout System**
    - Automatic account lockout after N failed login attempts (configurable via `MAX_LOGIN_ATTEMPTS`, default: 5)
    - Configurable lockout duration via `ACCOUNT_LOCKOUT_DURATION` (default: 30 minutes)
    - Email notifications when accounts are locked
    - Admin tools to manually unlock accounts
    - Audit logging for all lockout events
    - Database fields: `failedLoginAttempts`, `lockedUntil`, `lastLoginAt`

- **Password Expiry System**
    - Automatic password expiry after N days (configurable via `PASSWORD_EXPIRY_DAYS`, default: 90, 0 to disable)
    - Tracks password age via `passwordChangedAt` field
    - Email notifications when passwords expire
    - Forces password change on next login for expired passwords
    - Admin tools to reset password expiry
    - Audit logging for all password change events

- **Security Email Notifications**
    - Account locked notification with unlock instructions
    - Password expired notification with reset instructions
    - Account unlocked notification (admin action)
    - Professional HTML email templates
    - Configurable SMTP settings

#### Admin Security Tools

- **User Security Modal** (Frontend)
    - View user security status (failed attempts, lockout status, password age)
    - Manually unlock locked accounts
    - Reset password expiry for users
    - Force password change on next login
    - All actions audit logged
    - Available in Users page (shield icon button)
    - Restricted to ADMIN and SYSOP roles

- **User Security API Endpoints** (Backend)
    - `GET /api/users/:id/security` - Get security status
    - `POST /api/users/:id/security/unlock` - Unlock account
    - `POST /api/users/:id/security/reset-password-expiry` - Reset password expiry
    - `POST /api/users/:id/security/force-password-change` - Force password change
    - All endpoints restricted to ADMIN+ roles

#### Comprehensive Audit Logging

- **Audit Log System**
    - New `audit_logs` table with comprehensive schema
    - Tracks: action, resource, resourceId, userId, ipAddress, details (JSON), timestamp
    - Automatic logging for all security-relevant operations
    - Backward-compatible `auditService.logEvent()` method

- **Audit Log Viewer** (Frontend)
    - Available in Settings > Audit Logs tab (ADMIN+ only)
    - Advanced filtering: action, resource, user ID
    - Pagination support (50 logs per page)
    - Expandable JSON details viewer
    - Color-coded badges for actions and resources
    - Real-time stats (total events, current page)
    - Lazy-loaded for performance

- **Audit Log API Endpoints** (Backend)
    - `GET /api/audit-logs` - List logs with filtering and pagination
    - `GET /api/audit-logs/:id` - Get specific log entry
    - Both endpoints restricted to ADMIN+ roles
    - Supports query parameters: page, limit, action, resource, userId

- **Automatically Logged Events**
    - Authentication: LOGIN, LOGOUT, LOGIN_FAILED, ACCOUNT_LOCKED, ACCOUNT_UNLOCKED
    - User management: USER_CREATED, USER_UPDATED, USER_DELETED, USER_ROLE_CHANGED
    - Password: PASSWORD_CHANGED, PASSWORD_RESET, PASSWORD_EXPIRY_RESET
    - Security: FORCE_PASSWORD_CHANGE, SECURITY_STATUS_VIEWED
    - Settings: SETTING_UPDATED
    - All admin security actions

#### Database Migrations

- **Migration 1**: `20251001162148_add_auth_security_fields`
    - Added `failedLoginAttempts` (Int, default: 0)
    - Added `lockedUntil` (DateTime, nullable)
    - Added `passwordChangedAt` (DateTime, nullable)
    - Added `lastLoginAt` (DateTime, nullable)

- **Migration 2**: `20251001165101_update_audit_log_schema`
    - Updated `audit_logs` table schema
    - Changed `action` to String (was enum)
    - Changed `resource` to String (was `resourceType`)
    - Changed `details` to JSON (was separate fields)
    - Added indexes for performance

#### Backend Services

- **AuthSecurityService** (`backend/src/services/authSecurityService.js`)
    - `checkAccountSecurity()` - Validates lockout and password expiry
    - `recordFailedLogin()` - Tracks failed attempts and locks accounts
    - `clearFailedAttempts()` - Clears attempts on successful login
    - `unlockAccount()` - Admin unlock with audit logging
    - `resetPasswordExpiry()` - Admin reset with audit logging
    - `forcePasswordChange()` - Admin force change with audit logging

- **SecurityEmailService** (`backend/src/services/securityEmailService.js`)
    - `sendAccountLockedEmail()` - Sends lockout notification
    - `sendPasswordExpiredEmail()` - Sends expiry notification
    - `sendAccountUnlockedEmail()` - Sends unlock notification
    - Professional HTML templates with branding

- **Enhanced AuditService** (`backend/src/services/auditService.js`)
    - Backward-compatible `logEvent()` method
    - Automatic conversion of old schema to new schema
    - Support for both old and new calling patterns
    - Comprehensive error handling

#### Frontend Components

- **UserSecurityModal** (`frontend/src/components/users/UserSecurityModal.tsx`)
    - Full-featured security management modal
    - Real-time security status display
    - Action buttons: Unlock, Reset Expiry, Force Change
    - Confirmation dialogs for destructive actions
    - Loading states and error handling

- **AuditLogsContent** (`frontend/src/components/settings/AuditLogsContent.tsx`)
    - Comprehensive audit log viewer
    - Advanced filtering UI
    - Pagination controls
    - Expandable JSON details
    - Color-coded badges
    - Responsive design

- **Enhanced AuthenticationSettings** (`frontend/src/components/settings/AuthenticationSettings.tsx`)
    - Display account lockout settings
    - Display password expiry settings
    - Visual indicators for enabled features

#### Authorization Enhancements

- **Enhanced Authorization Middleware** (`backend/src/middleware/authorization.js`)
    - New `requireRole()` function for role-based access
    - Hierarchical role checking (SYSOP > ADMIN > MANAGER > OPERATOR > VIEWER)
    - Backward compatible with existing `requireAdmin()`, `requireViewer()`, etc.
    - Used in audit log and user security routes

#### Configuration

- **New Environment Variables**
    - `MAX_LOGIN_ATTEMPTS` - Failed login threshold (default: 5)
    - `ACCOUNT_LOCKOUT_DURATION` - Lockout duration in minutes (default: 30)
    - `PASSWORD_EXPIRY_DAYS` - Password expiry in days (default: 90, 0 to disable)

#### Impact

- **Security**: Comprehensive authentication security enforcement
- **Compliance**: Full audit trail for all security-relevant operations
- **Usability**: Admin tools for managing user security
- **Transparency**: Audit log viewer for security monitoring
- **Maintainability**: Clean, well-documented code with backward compatibility

### Changed

- **Login Flow**: Now checks account lockout and password expiry before authentication
- **User Model**: Added security-related fields (failedLoginAttempts, lockedUntil, passwordChangedAt, lastLoginAt)
- **Audit Log Schema**: Simplified and more flexible JSON-based schema
- **Settings Page**: Added Audit Logs tab (ADMIN+ only)
- **Users Page**: Added security management button (shield icon)

### Fixed

- **Audit Log Routes**: Added missing authentication middleware
- **Authorization**: Fixed role hierarchy checking in `requireRole()`
- **Settings Layout**: Implemented role-based tab filtering

---

## [1.4.0] - 2025-09-30

### Changed - Air-Gapped Simplification

**Major simplification for air-gapped and self-hosted environments** - Removed 315 lines (32% reduction) of complexity designed for multi-tenant SaaS scenarios while maintaining all essential security controls.

#### Authentication & Security Simplifications

- **SMTP Configuration**: Removed database storage and encryption overhead
    - Now uses environment variables only (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_PORT`)
    - Disabled API endpoints for runtime SMTP configuration changes
    - Static configuration appropriate for air-gapped deployments
    - **Impact**: -150 lines, simpler deployment, easier to audit

- **JWT Token Claims**: Simplified token structure for single-application deployments
    - Removed `audience` and `issuer` claims (unnecessary for single app)
    - Retained essential claims: `id`, `username`, `email`, `role`, `iat`, `jti`
    - Algorithm specification (`HS256`) prevents confusion attacks
    - **Impact**: -10 lines, simpler token validation

- **Cookie Configuration**: Removed multi-domain complexity
    - Removed `COOKIE_DOMAIN` configuration (single domain deployment)
    - Removed `COOKIE_MAX_AGE` configuration (sensible 24h default)
    - Simplified to: `httpOnly`, `secure`, `sameSite`, `path`, `maxAge`
    - **Impact**: -5 lines, clearer configuration

- **Key Strength Validation**: Simplified for generated keys
    - Removed complex entropy calculations (Shannon entropy, 100-point scoring)
    - Basic length (32+ chars) and character variety checks (2+ types)
    - Generated keys are always cryptographically strong
    - **Impact**: -50 lines, faster startup validation

- **Reset Token Storage**: Simplified hashing approach
    - Removed double-hashing (SHA-256 + salt)
    - Store plaintext tokens (JWT signature provides tamper protection)
    - Rationale: Database compromise implies full system compromise in air-gapped environments
    - **Impact**: -20 lines, simpler implementation, easier to audit

- **Key Rotation Infrastructure**: Removed automated rotation
    - Removed `npm run rotate-keys` script and infrastructure
    - Documented manual key rotation process for scheduled maintenance
    - Manual process provides better control and visibility
    - Scheduled downtime is acceptable in air-gapped environments
    - **Impact**: -80 lines, simpler maintenance procedures

#### Updated Documentation

- **SECURITY.md**: Updated with air-gapped optimizations and manual procedures
- **SECURITY_REVIEW_SPERNAKIT.md**: Consolidated into SECURITY.md
- **JSON config**: Removed deprecated variables, added air-gapped guidance
- **scripts/generate-keys.js**: Updated production warnings for manual rotation

#### Security Impact

**No security regressions** - All essential security controls retained:

- ✅ bcrypt password hashing (12 rounds)
- ✅ JWT token expiration and algorithm specification
- ✅ HTTP-only cookies with environment-aware security settings
- ✅ Rate limiting on authentication endpoints
- ✅ Comprehensive audit logging
- ✅ RBAC authorization with role hierarchy
- ✅ Password policy enforcement
- ✅ Account lockout after failed attempts

#### Files Modified

- `backend/src/services/authService.js` (-72 lines)
- `backend/src/services/keyManagementService.js` (-168 lines)
- `backend/src/controllers/authController.js` (simplified cookie config)
- `backend/src/controllers/settingsController.js` (disabled SMTP API endpoints)
- `JSON config` (removed deprecated variables)
- `package.json` (removed rotate-keys script)
- `scripts/generate-keys.js` (updated warnings)
- `docs/SECURITY.md` (comprehensive air-gapped documentation)

#### Files Removed

- `scripts/rotate-keys.js` (247 lines) - Replaced with manual process documentation

### Migration Guide

For existing deployments upgrading to 1.4.0:

1. **Environment Variables**: Remove deprecated variables from configuration:
    - `JWT_AUDIENCE`
    - `JWT_ISSUER`
    - `COOKIE_DOMAIN`
    - `COOKIE_MAX_AGE`

2. **SMTP Configuration**: Ensure SMTP is configured via JSON config:
    - `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_PORT`, `SMTP_FROM`
    - Remove any database SMTP configuration

3. **Key Rotation**: Update procedures to use manual process:
    - Replace `npm run rotate-keys` with documented manual steps
    - See `docs/SECURITY.md` section 5 for complete procedure

4. **No Data Migration Required**: All changes are backward compatible

## [1.3.0] - 2025-09-26

### Added

- **User Profile System**: Comprehensive user profile management accessible to all authenticated users
    - Personal information display (username, email, role, member since)
    - Display preferences (theme, layout, language, date/time formats, pagination)
    - Security settings with password reset integration
    - Notification preferences with granular controls
    - Professional tabbed interface matching DaisyUI design system
- **Enhanced Navigation**: Professional dropdown user menu with profile access and RBAC integration
- **SMTP Configuration Management**: Dynamic SMTP settings with database storage and encryption
- **Email Service Integration**: Conditional email features based on SMTP availability
- **Enhanced Password Reset**: Advanced password strength validation with visual feedback and rate limiting
- **User Profile Documentation**: Complete USER_PROFILES.md with implementation details and customization guide

### Changed

- **Settings Page**: Removed user preferences from admin-only Settings page
- **RBAC Separation**: Clear separation between user profiles (all users) and system settings (SYSOP only)
- **Navigation UX**: Replaced simple user info with professional dropdown menu
- **Authentication Flow**: Enhanced password reset with better error handling and user feedback

### Enhanced

- **API Endpoints**: Added email configuration status and SMTP management endpoints
- **Documentation**: Updated template documentation with User Profile system details
- **TypeScript Safety**: Proper interfaces and type definitions throughout User Profile system
- **Error Handling**: Comprehensive validation and error recovery for all profile operations

## [1.2.0] - 2025-01-22

### Added

- **Comprehensive Troubleshooting Guide**: Detailed guide with common issues, solutions, and debugging tips
- **Enhanced Configuration Documentation**: Comprehensive JSON config documentation with all configuration options and documentation
- **Updated Documentation Cross-References**: All documentation files now properly reference each other
- **Performance and Optimization Documentation**: Added documentation for virtual scrolling, performance utilities, and memory management features

### Changed

- **Node.js Requirement**: Updated minimum Node.js version from 18+ to 20+ across all documentation
- **Documentation Structure**: Reorganized and updated all documentation files for consistency and completeness
- **README.md**: Updated with current dependency versions (React 19, latest packages) and comprehensive documentation links
- **Configuration**: Expanded JSON config documentation with detailed configuration options and security guidelines

### Fixed

- **Documentation Consistency**: Fixed all cross-references between documentation files
- **Missing Documentation**: Created previously referenced but missing documentation files
- **Version Information**: Updated all version references to reflect current state of dependencies
- **Code Examples**: Verified and updated all code examples to work with current codebase

### Documentation

- **API Documentation**: Complete backend API reference with authentication, endpoints, and examples
- **Troubleshooting Guide**: Comprehensive guide for common issues, debugging, and solutions
- **Configuration Documentation**: Detailed JSON config documentation with all available configuration options
- **Cross-References**: All documentation files now properly link to related resources

## [1.1.2] - 2025-09-16

### Fixed

- **Hostname Consistency**: Standardized all localhost references to localhost to prevent cookie domain conflicts
    - Updated configuration examples, `api.ts`, `app.js`, `docker-compose.yml` to use localhost exclusively
    - Removed localhost fallback from CORS configuration
- **Check-Page Authentication**: Fixed timing issues in automated testing
    - Added dashboard data loading wait logic to prevent premature logout
    - Removed forced page reload after logout that caused 401 errors
    - Wait for natural redirect to login page instead of forcing reload

### Changed

- **Cookie Security**: Made sameSite setting environment-aware
    - Production: 'strict' for maximum security
    - Development: 'lax' to prevent hostname consistency issues

## [1.1.1] - 2025-09-10

### Added

- Settings API (controller, service, routes) with encryptedFields support and AES-256-GCM via security util
- Standard ApiResponse helper for consistent success/error envelopes

### Changed

- Documentation: Implementation guide now lists `/api/settings/*`; clarified encryption policy (AES-GCM only)

## [1.1.0] - 2025-09-07

### Added

- **MANAGER Role**: New hierarchical role between ADMIN and OPERATOR with team and user management capabilities
- **Enhanced RBAC System**: Upgraded from 4-tier to 5-tier role system (SYSOP, ADMIN, MANAGER, OPERATOR, VIEWER)
- **Hierarchical Permission Checking**: Implemented proper role hierarchy where higher roles inherit lower role permissions
- **Roles Page UI Improvements**: Enhanced table layout with non-wrapping columns, better spacing, and modal for API test results
- **Comprehensive Documentation**: Updated all documentation to reflect MANAGER role and RBAC system changes

### Changed

- **Role Hierarchy**: Updated from 4 levels to 5 levels with MANAGER at level 3
- **Permission Matrix**: MANAGER can manage OPERATOR and VIEWER users with full access to user details
- **Route Protection**: Updated all backend routes to include MANAGER permissions where appropriate
- **Frontend Components**: Updated AuthContext, ProtectedRoute, and navigation to support MANAGER role
- **API Endpoints**: Enhanced user, role, and data routes to include MANAGER access levels
- **Test Coverage**: Added comprehensive tests for MANAGER role hierarchy and permissions

### Fixed

- **Route Protection Inconsistency**: Fixed critical issue where OPERATOR users were blocked from accessing pages they should have limited access to
- **RBAC Documentation Sync**: Ensured perfect alignment between documentation, backend implementation, and frontend display
- **Limited Access Specifications**: Added clear definitions for all "Limited" access levels across resources
- **TypeScript Types**: Fixed all lint errors and improved type safety in Roles page component

## [1.0.3] - 2025-09-06

### Fixed

- **Environment variables**: Standardized to use only `VITE_` prefixed variables for frontend access
- **Vite configuration**: Updated to use `VITE_APP_NAME`, `VITE_APP_SLUG`, `VITE_APP_DESCRIPTION` exclusively
- **TypeScript definitions**: Updated `vite-env.d.ts` to include both prefixed and legacy variable types
- **Environment files**: Removed redundant non-prefixed variables, keeping only VITE\_ versions
- **Application branding**: Fixed app name display in navigation header

### Changed

- **Environment variable naming**: All frontend-accessible variables now use `VITE_` prefix consistently
- **Configuration approach**: Simplified Vite define configuration to use only prefixed variables

## [1.0.2] - 2025-09-06

### Removed

- **Domain-specific pages**: Removed SqlServerSync, TaskDetail, Tasks, ConnectionDetail, and Connections pages
- **Domain-specific components**: Removed all task and connection-related forms and components
- **Domain-specific services**: Removed connectionsService and tasksService from frontend
- **Domain-specific types**: Cleaned up TypeScript interfaces to include only generic enterprise types
- **Domain-specific routes**: Removed all task and connection routes from App.tsx and Navigation
- **Domain-specific tests**: Removed connection-related test files
- **SCHEDULER references**: Eliminated all references to the source application

### Changed

- **Navigation menu**: Now shows only Dashboard, Users, Roles, and Settings (based on RBAC)
- **TypeScript types**: Streamlined to include only User, Setting, AuditLog, Notification, and Dashboard types
- **Route structure**: Simplified to core enterprise application routes only

## [1.0.1] - 2025-09-06

### Fixed

- Database directory structure standardized to root-level `/data/` instead of `/backend/data/`
- Added missing `database.js` utility file for Prisma client configuration
- Fixed Express wildcard route syntax compatibility issue
- Corrected systemMetricsService method name reference in app.js
- Enhanced userService and systemMetricsService with dashboard statistics methods
- Updated dashboard routes to use generic template-appropriate functionality

### Changed

- DATABASE_URL path updated to `file:../data/app-name.db` format
- Dashboard controller now uses userService and systemMetricsService instead of domain-specific services

## [1.0.0] - 2025-09-06

### Added

- Initial release of spernakit
- Complete full-stack application with Node.js + Express backend and React + TypeScript frontend
- JWT-based authentication with cookie storage
- Role-based access control (RBAC) with five-tier system (SYSOP, ADMIN, MANAGER, OPERATOR, VIEWER)
- Comprehensive audit trail system for all user actions
- Soft delete functionality with restore capabilities
- Settings management system for runtime configuration
- Performance monitoring and metrics collection
- User management with complete CRUD operations
- Dashboard with system metrics and analytics
- Responsive design with DaisyUI + Tailwind CSS
- Docker containerization for production deployment
- Comprehensive documentation and customization guides
- Database seeding with default users for each role
- Automated setup script for easy customization
- ESLint and Prettier configuration for code quality
- Testing setup with Vitest and Testing Library
- Production-ready security middleware
- Rate limiting and CORS configuration
- Health check endpoints
- Graceful shutdown handling

### Security

- Helmet.js for security headers
- CORS configuration with environment-based origins
- Rate limiting on API endpoints
- JWT token validation and refresh
- Password hashing with bcrypt
- Input validation with Joi
- SQL injection protection with Prisma ORM
- XSS protection through proper data handling

### Database

- SQLite database with Prisma ORM
- Comprehensive schema with audit fields
- Database migrations and seeding
- Soft delete implementation
- Foreign key relationships
- Indexed fields for performance

### Frontend

- React 19 with TypeScript
- TanStack Query for server state
- React Router for navigation
- React Hook Form for form handling
- Responsive design with mobile support
- Component-based architecture
- Custom hooks for reusable logic
- Type-safe API integration

### Backend

- Express.js with TypeScript support
- Modular architecture with services and controllers
- Comprehensive middleware stack
- Error handling and logging
- API documentation ready
- Environment-based configuration
- Production security checks

### DevOps

- Docker Compose for development and production
- Multi-stage Docker builds
- Nginx reverse proxy configuration
- Health checks and monitoring
- Environment-specific configurations
- Automated database migrations

### Documentation

- Comprehensive README with quick start guide
- Implementation guide with detailed examples
- RBAC documentation with permission matrix
- Customization guide for extending the template
- API documentation structure
- Docker deployment instructions

## [Unreleased]

### Planned

- API documentation with OpenAPI/Swagger
- Email notification system
- File upload and management
- Advanced search and filtering
- Bulk operations support
- Export functionality (CSV, PDF)
- Advanced analytics and reporting
- Multi-language support (i18n)
- Theme customization
- Plugin system for extensions
- WebSocket support for real-time features
- Advanced caching strategies
- Performance optimization guides
- Security audit checklist
- Automated testing pipeline
- Monitoring and alerting setup
