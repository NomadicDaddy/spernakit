## Centralized HTTP client

- Use the centralized API client (`apiClient` from `api/client.ts`) for all app requests.
- App code must not use raw `fetch` outside the ApiClient (except tooling/scripts outside app runtime).

## Helpers

- The `ApiClient` class provides `get`, `post`, `put`, `delete` methods that return typed data directly (shape defined by backend envelope).
- Methods accept generic type parameters for type-safe responses.

## Error handling

- `ApiClient` throws `ApiError` for non-2xx responses; handle errors via centralized error handling in `handleResponse()`, not per-component try/catch for common cases.
- The centralized handler manages 401 (session timeout), 403 (permission denied), and 5xx (server error) with toast notifications.
- Components should only opt into status-aware flows when necessary.

## Backend alignment

- Backend returns explicit HTTP status codes on all success paths.
- Client-side code should not special-case `200` vs `201` unless business logic requires it; use `*WithStatus` in those cases only.

## Consistency

- Keep method names, signatures, and return shapes consistent across template and implementations to avoid drift.

## TanStack Query Integration Pattern

### Cache Configuration

All TanStack Query cache settings are centralized in `config/cacheConfig.ts`:

```typescript
import { CACHE_CONFIG } from '@/config/cacheConfig';
```

`refetchOnWindowFocus` is disabled globally in the `QueryClient` default options (`App.tsx`) and per-query via `CACHE_CONFIG.REFETCH_ON_WINDOW_FOCUS`.

### API Service Layer

Create service modules in `services/` that use the centralized API client:

```typescript
// services/resourceService.ts
import type { ApiResponse, Resource } from '@/types';
import { apiClient } from '@/api/client';

export const resourceService = {
	async list(page: number, limit: number) {
		return apiClient.get<ApiResponse<ResourceListResponse>>('/resources', { page, limit });
	},

	async create(payload: CreateResourceInput) {
		return apiClient.post<ApiResponse<{ resource: Resource }>>('/resources', payload);
	},

	async update(id: number, payload: UpdateResourceInput) {
		return apiClient.put<ApiResponse<{ resource: Resource }>>(`/resources/${id}`, payload);
	},

	async remove(id: number) {
		return apiClient.delete<ApiResponse<{ id: number }>>(`/resources/${id}`);
	},
};
```

### Custom Hooks

Create React Query hooks in `hooks/` that wrap service calls:

```typescript
// hooks/useResourcesList.ts
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { CACHE_CONFIG } from '@/config/cacheConfig';
import { resourceService } from '@/services/resourceService';

export function useResourcesList(params: {
	page: number;
	limit: number;
	enabled: boolean;
}): UseQueryResult<ResourceListResponse | undefined, unknown> {
	const { page, limit, enabled } = params;

	return useQuery<ResourceListResponse | undefined>({
		enabled,
		queryFn: async () => {
			const response = await resourceService.list(page, limit);
			return response.data;
		},
		queryKey: ['resources', page, limit],
		refetchOnWindowFocus: CACHE_CONFIG.REFETCH_ON_WINDOW_FOCUS,
		staleTime: CACHE_CONFIG.DEFAULT_STALE_TIME,
	});
}
```

Mutation hooks use `useMutation` with `invalidateQueries` on success:

```typescript
export function useCreateResource() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: resourceService.create,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['resources'] });
		},
	});
}
```

### Component Usage

```typescript
// components/ResourceList.tsx
const { data, isLoading, error } = useResourcesList({ page, limit, enabled: true });
const createMutation = useCreateResource();

const handleCreate = async (formData: CreateResourceInput) => {
	await createMutation.mutateAsync(formData);
};
```

## WebSocket Integration

- `useWebSocket` is a side-effect-only hook (returns `void`) called once in AppShell; it manages a `WebSocketManager` singleton that auto-connects when authenticated and auto-reconnects with exponential backoff
- Connection state is read via `useWsStore` (Zustand), not from the hook return value
- Dedicated stream hooks (e.g., `useNotificationStream`) subscribe to events and invalidate TanStack Query caches
- Auto-refetch on window focus: **disabled** globally
- Event names use dot-separated format (e.g., `notification.new`, `notification.status`)

**Pattern**:

```typescript
// hooks/useNotificationStream.ts - subscribes to WS events and invalidates caches
import { wsClient } from '../services/wsClient';

export function useNotificationStream(): void {
	const queryClient = useQueryClient();

	useEffect(() => {
		const unsubNew = wsClient.subscribe('notification.new', () => {
			void queryClient.invalidateQueries({ queryKey: ['notifications'] });
		});

		const unsubStatus = wsClient.subscribe('notification.status', () => {
			void queryClient.invalidateQueries({ queryKey: ['notifications'] });
		});

		return () => {
			unsubNew();
			unsubStatus();
		};
	}, [queryClient]);
}
```

## Response Format Standards

### Success Response

```json
{
	"data": {
		// Payload here
	}
}
```

> **Note:** Success responses contain only the `data` field. The `error`, `code`, and `message` fields are present only in error responses.

### Error Response

```json
{
	"error": "Error type",
	"message": "Human-readable error message",
	"success": false
}
```

The `details` field is included only when additional context is available (e.g., validation errors):

```json
{
	"details": [ ... ],
	"error": "Validation Error",
	"message": "1 validation error(s) found",
	"success": false
}
```

### Paginated Response

```json
{
	"data": [
		// Items here
	],
	"limit": 10,
	"page": 1,
	"total": 100
}
```

> **Note:** Pagination fields (`page`, `limit`, `total`) are at the top level alongside `data`, not nested in a `pagination` object. The `data` field is always an array of items.

---

## CSRF Token Handling

Spernakit uses CSRF (Cross-Site Request Forgery) tokens to protect authenticated state-changing requests.

### Token Lifecycle

1. **Login:** User authenticates successfully. The server generates an **HMAC-based** CSRF token using `createHmac('sha256', secret)` with a timestamp and nonce. The format is `<timestamp_hex>.<nonce_hex>.<hmac_hex>`. The signing secret is stored in the `users` table; the derived token is stateless (HMAC-verifiable) and not stored.
2. **Delivery:** The token is returned in both the `X-CSRF-Token` response header and the response body `data.csrfToken`.
3. **Storage:** The frontend stores the token in the Zustand `authStore`.
4. **Request:** The frontend includes the token in the `X-CSRF-Token` request header on all API calls via `getCsrfHeader()` in `api/requestHelpers.ts`.
5. **Validation:** The `csrfPlugin` validates the token on every state-changing request using **timing-safe comparison**.

### Protected Methods

CSRF validation applies to all **state-changing** HTTP methods:

- `POST`
- `PUT`
- `DELETE`
- `PATCH`

Safe methods (`GET`, `HEAD`, `OPTIONS`) are exempt from CSRF validation.

### Exempt Requests

- **API key authenticated requests** -- Requests authenticated via API key bypass CSRF validation (the API key itself serves as proof of intent).
- **Unauthenticated requests** -- Public endpoints that do not require a logged-in user are not subject to CSRF checks.

### Error Response

When CSRF validation fails, the server returns:

```json
{
	"code": "AUTH_CSRF_TOKEN_INVALID",
	"error": "CSRF validation failed",
	"success": false
}
```

**HTTP Status:** 403 Forbidden

### Implementation Files

| Component            | File Path                            |
| -------------------- | ------------------------------------ |
| CSRF plugin          | `backend/src/plugins/csrf.ts`        |
| Login (token return) | `backend/src/routes/auth/login.ts`   |
| Frontend helpers     | `frontend/src/api/requestHelpers.ts` |
| Frontend API client  | `frontend/src/api/client.ts`         |
| Auth store           | `frontend/src/stores/authStore.ts`   |

### Request Header Summary

All authenticated API requests include these headers:

| Header           | Source                  | Purpose                       |
| ---------------- | ----------------------- | ----------------------------- |
| `X-CSRF-Token`   | Auth store (from login) | CSRF protection               |
| `X-Request-ID`   | `correlationId.ts`      | Request tracing               |
| `X-Session-ID`   | `correlationId.ts`      | Session-level correlation     |
| `X-Workspace-ID` | `workspaceStore`        | Workspace context (if active) |
| `Content-Type`   | Static                  | `application/json`            |
