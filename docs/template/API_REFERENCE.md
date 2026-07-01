# 🔌 API Documentation

This document provides comprehensive documentation for the Spernakit backend API endpoints.

## 📋 Table of Contents

1. [Base URL & Authentication](#base-url--authentication)
2. [Deprecation Policy](#deprecation-policy)
3. [Response Format](#response-format)
4. [Authentication Endpoints](#authentication-endpoints)
5. [OAuth Authentication](#oauth-authentication)
6. [User Management](#user-management)
7. [User API Keys](#user-api-keys)
8. [User Bulk Operations](#user-bulk-operations)
9. [Workspaces](#workspaces)
10. [Dashboard Management](#dashboard-management)
11. [Files](#files)
12. [Tasks](#tasks)
13. [Business Metrics](#business-metrics)
14. [Audit Logs](#audit-logs)
15. [System & Health Endpoints](#system--health-endpoints)
16. [Health Checks & Alerts](#health-checks--alerts)
17. [System Backup](#system-backup)
18. [Notification System](#notification-system)
19. [Settings Management](#settings-management)
20. [Settings - SMTP & Email](#settings---smtp--email)
21. [Settings - Authentication Security](#settings---authentication-security)
22. [Error Handling](#error-handling)
23. [Additional Endpoints](#additional-endpoints)

---

## 🌐 Base URL & Authentication

### Base URL

All API endpoints are served under `/api/v1/`:

```
{server.frontendUrl}/api/v1
```

### API Versioning Strategy

Spernakit uses **URL path versioning** (the most explicit and widely understood approach):

- **Current version:** `v1` (all endpoints under `/api/v1/`)
- **Version format:** `v{major}` (e.g., `v1`, `v2`)
- **Breaking changes** require a new major version (new prefix like `/api/v2/`)
- **Non-breaking additions** (new fields, new endpoints) are added to the current version
- **Clients** should always include the version prefix in API calls

When a new API version is introduced, the previous version will remain available for a transition period to allow clients to migrate.

---

## Deprecation Policy

Spernakit follows a straightforward deprecation process for API changes.

### Process for Introducing Breaking Changes

1. **Identify the change** -- Determine whether the change is breaking (removing a field, changing response shape, removing an endpoint) or non-breaking (adding a field, adding an endpoint).
2. **Non-breaking changes** are added directly to the current API version with no deprecation needed.
3. **Breaking changes** -- Create the new endpoint or version with the updated behavior, update the CHANGELOG and API documentation, then remove the old endpoint. For downstream apps with external API consumers, introduce a notice period before removal.

### OpenAPI / Swagger

The backend provides an OpenAPI 3.0 specification and an interactive Swagger UI.

- **Interactive UI**: `GET /api/v1/docs`
- **Raw JSON Spec**: `GET /api/v1/docs/json`

#### OpenAPI Version Info

- `info.version`: the **application** version (from root `package.json`)

### Authentication

All protected endpoints require JWT authentication via HTTP-only cookies or Authorization header:

```bash
# Cookie-based (automatic after login)
Cookie: token=your-jwt-token

# Header-based
Authorization: Bearer your-jwt-token
```

### Role-Based Access Control

The API implements a 5-tier role system:

- **SYSOP** (Level 5) - System administrator
- **ADMIN** (Level 4) - Application administrator
- **MANAGER** (Level 3) - Team and user manager
- **OPERATOR** (Level 2) - Standard operator
- **VIEWER** (Level 1) - Read-only access

---

## 📤 Response Format

All API responses follow a consistent format:

### Success Response

```json
{
	"data": {
		// Response data here
	},
	"message": "Operation completed successfully",
	"success": true
}
```

### Error Response

```json
{
	"error": "Error category",
	"message": "Detailed error message",
	"success": false
}
```

---

## 🔐 Authentication Endpoints

### POST /api/v1/auth/login

Authenticate user and receive JWT token.

**Request Body:**

```json
{
	"password": "password123",
	"username": "user@example.com"
}
```

**Response (200):**

```json
{
	"data": {
		"email": "admin@example.com",
		"id": 1,
		"role": "ADMIN",
		"roleLabels": {},
		"username": "admin"
	}
}
```

**Errors:**

- `401` - Invalid credentials
- `429` - Too many login attempts

When the user has MFA enabled, the response is `{ "data": { "mfaRequired": true, "mfaToken": "..." } }` instead — complete login via `POST /api/v1/auth/mfa/verify`.

### POST /api/v1/auth/mfa/verify

Complete an MFA-gated login. Exchanges the short-lived `mfaToken` from the login response plus a TOTP code for full auth tokens (no prior authentication required).

**Request Body:**

```json
{
	"code": "123456",
	"mfaToken": "<mfaToken from login response>"
}
```

**Response (200):** Same shape as a successful login (sets auth cookies).

**Errors:**

- `401` - MFA challenge token invalid/expired (`AUTH_MFA_TOKEN_INVALID`) or wrong code (`AUTH_MFA_INVALID_CODE`)
- `429` - Too many MFA attempts

### POST /api/v1/auth/register

Register a new user account (public endpoint).

**Request Body:**

```json
{
	"confirmPassword": "SecurePassword123!",
	"email": "newuser@example.com",
	"password": "SecurePassword123!",
	"username": "newuser"
}
```

**Response (201):**

```json
{
	"data": {
		"user": {
			"email": "newuser@example.com",
			"id": 6,
			"role": "VIEWER",
			"username": "newuser"
		}
	},
	"message": "Registration successful",
	"success": true
}
```

**Errors:**

- `400` - Validation failed (weak password, missing fields)
- `409` - Email or username already exists

### POST /api/v1/auth/logout

Logout user and clear authentication cookie.

**Headers:** `Authorization: Bearer token` or authenticated cookie

**Response (200):**

```json
{
	"message": "Logout successful",
	"success": true
}
```

### GET /api/v1/auth/me

Get current authenticated user information (validates JWT from cookie).

**Headers:** Authenticated cookie

**Response (200):**

```json
{
	"data": {
		"email": "admin@example.com",
		"id": 1,
		"requiresPasswordChange": false,
		"role": "ADMIN",
		"roleLabels": {},
		"username": "admin"
	}
}
```

### POST /api/v1/auth/refresh

Refresh access token using refresh cookie.

**Response (200):**

```json
{
	"success": true
}
```

### POST /api/v1/auth/forgot-password

Request a password reset email.

**Request Body:**

```json
{
	"email": "user@example.com"
}
```

**Response (200):**

```json
{
	"success": true
}
```

### POST /api/v1/auth/reset-password

Reset password with token.

**Request Body:**

```json
{
	"password": "newpassword123",
	"token": "reset-token-string"
}
```

**Response (200):**

```json
{
	"success": true
}
```

---

## 👥 User Management

### GET /api/v1/users

List all users with pagination and filtering.

**Access:** ADMIN+

**Query Parameters:**

- `page` (number, default: 1) - Page number
- `limit` (number, default: 20) - Items per page
- `search` (string) - Search by username or email
- `role` (string) - Filter by role

**Response (200):**

```json
{
	"data": {
		"pagination": {
			"limit": 20,
			"page": 1,
			"pages": 1,
			"total": 1
		},
		"users": [
			{
				"createdAt": "2024-01-01T00:00:00.000Z",
				"email": "admin@example.com",
				"id": 1,
				"role": "ADMIN",
				"updatedAt": "2024-01-01T00:00:00.000Z",
				"username": "admin"
			}
		]
	},
	"message": "Users retrieved successfully",
	"success": true
}
```

### GET /api/v1/users/:id

Get user by ID.

**Access:** ADMIN+

**Response (200):**

```json
{
	"data": {
		"user": {
			"createdAt": "2024-01-01T00:00:00.000Z",
			"email": "admin@example.com",
			"id": 1,
			"role": "ADMIN",
			"updatedAt": "2024-01-01T00:00:00.000Z",
			"username": "admin"
		}
	},
	"message": "User retrieved successfully",
	"success": true
}
```

### POST /api/v1/users

Create a new user.

**Access:** ADMIN+

**Request Body:**

```json
{
	"email": "newuser@example.com",
	"password": "password123",
	"role": "OPERATOR",
	"username": "newuser"
}
```

**Response (201):**

```json
{
	"data": {
		"user": {
			"createdAt": "2024-01-01T00:00:00.000Z",
			"email": "newuser@example.com",
			"id": 2,
			"role": "OPERATOR",
			"updatedAt": "2024-01-01T00:00:00.000Z",
			"username": "newuser"
		}
	},
	"message": "User created successfully",
	"success": true
}
```

### PUT /api/v1/users/:id

Update user information.

**Access:** ADMIN+

**Request Body:**

```json
{
	"email": "updated@example.com",
	"role": "VIEWER",
	"username": "updateduser"
}
```

**Response (200):**

```json
{
	"data": {
		"user": {
			"createdAt": "2024-01-01T00:00:00.000Z",
			"email": "updated@example.com",
			"id": 2,
			"role": "VIEWER",
			"updatedAt": "2024-01-01T01:00:00.000Z",
			"username": "updateduser"
		}
	},
	"message": "User updated successfully",
	"success": true
}
```

### DELETE /api/v1/users/:id

Delete user (soft delete).

**Access:** ADMIN+

**Response (200):**

```json
{
	"message": "User deleted successfully",
	"success": true
}
```

---

## 📋 Audit Logs

### GET /api/v1/audit-logs

List audit logs with filtering and pagination.

**Authorization:** ADMIN or SYSOP

**Query Parameters:**

- `page` (number, optional) - Page number (default: 1)
- `limit` (number, optional) - Items per page (default: 20, max: 100)
- `action` (string, optional) - Filter by action (e.g., user.login, workspace.create)
- `userId` (number, optional) - Filter by user ID
- `search` (string, optional) - Free-text search
- `dateFrom` (string, optional) - Start date filter (ISO 8601)
- `dateTo` (string, optional) - End date filter (ISO 8601)
- `fields` (string, optional) - Comma-separated list of fields to return

**Response (200):**

```json
{
	"data": {
		"data": [
			{
				"action": "user.login",
				"createdAt": "2026-01-15T14:30:00Z",
				"details": null,
				"id": 150,
				"ip": "192.168.1.10",
				"userId": 1,
				"username": "admin",
				"workspaceId": 1
			}
		],
		"limit": 20,
		"page": 1,
		"total": 150
	},
	"success": true
}
```

---

## 📊 System & Health Endpoints

### GET /api/v1/health

Basic health check (no authentication required). Returns the overall status and last check time only — no internal details such as schema version are disclosed.

**Response (200):**

```json
{
	"lastChecked": "2026-01-01T00:00:00.000Z",
	"status": "healthy"
}
```

`status` is one of `healthy`, `degraded`, or `unhealthy`.

### GET /api/v1/health/ready

Readiness probe for orchestrators (Kubernetes, Docker Swarm). No authentication required. Uses a short 5-second cache so orchestrators notice database outages quickly.

**Response (200)** — application is ready to accept traffic (`degraded` deliberately stays 200):

```json
{
	"ready": true,
	"status": "healthy"
}
```

**Response (503)** — application is not ready (e.g., database unreachable):

```json
{
	"ready": false,
	"status": "unhealthy"
}
```

### GET /api/v1/health/details

Get detailed health check results.

**Access:** OPERATOR+

**Response (200):** Detailed health check data including database, memory, filesystem checks.

### GET /api/v1/health/history

Get health check history and active alerts.

**Access:** ADMIN+

**Response (200):** Health check history array and active alerts.

### GET /api/v1/system/dashboard

Get dashboard statistics.

**Access:** OPERATOR+

**Response (200):**

```json
{
	"auditEvents": 150,
	"metrics": {
		"activeConnections": 2,
		"cpuUsage": 23.1,
		"memoryUsage": 45.2,
		"requestCount": 500
	},
	"systemHealth": "ok",
	"totalUsers": 5,
	"unreadNotifications": 3
}
```

### GET /api/v1/system/metrics

Get system metrics with history.

**Access:** OPERATOR+

**Query Parameters:**

- `hours` (number, default: 24) - Hours of history to retrieve
- `limit` (number, default: 100) - Maximum data points

**Response (200):**

```json
{
	"current": {
		"activeConnections": 2,
		"cpuUsage": 23.1,
		"memoryFree": 8192,
		"memoryTotal": 16384,
		"memoryUsage": 45.2,
		"requestCount": 500,
		"timestamp": "2024-01-01T00:00:00.000Z"
	},
	"history": [],
	"latest": {}
}
```

### POST /api/v1/system/web-vitals

Receive frontend Core Web Vitals batch.

**Access:** All authenticated users

**Request Body:**

```json
{
	"metrics": [
		{
			"name": "LCP",
			"navigationType": "navigate",
			"rating": "good",
			"value": 1200
		}
	],
	"timestamp": "2024-01-01T00:00:00.000Z",
	"url": "/dashboard"
}
```

**Response:** 204 No Content

### GET /api/v1/system/web-vitals

Get Core Web Vitals summary.

**Access:** OPERATOR+

**Query Parameters:**

- `hours` (number, default: 24) - Hours of history

---

## 🔔 Notification System

### GET /api/v1/notifications

List notifications with filtering and pagination.

**Access:** VIEWER+ (users see only their own notifications unless SYSOP/ADMIN)

**Query Parameters:**

- `page` (number, default: 1) - Page number
- `limit` (number, default: 20) - Items per page
- `readStatus` (string) - Filter by read status (all, read, unread)
- `type` (string) - Filter by type (info, success, warning, error)

**Response (200):**

```json
{
	"data": {
		"notifications": [
			{
				"createdAt": "2024-01-01T00:00:00.000Z",
				"id": 1,
				"isRead": false,
				"message": "Your account has been created successfully",
				"title": "Welcome!",
				"type": "SUCCESS",
				"user": {
					"email": "admin@example.com",
					"id": 1,
					"username": "admin"
				},
				"userId": 1
			}
		],
		"pagination": {
			"limit": 20,
			"page": 1,
			"pages": 1,
			"total": 1
		}
	},
	"message": "Notifications retrieved successfully",
	"success": true
}
```

### GET /api/v1/notifications/statistics

Get notification statistics.

**Access:** VIEWER+ (users see only their own statistics unless SYSOP/ADMIN)

**Query Parameters:**

- `userId` (number) - Get statistics for specific user (SYSOP/ADMIN only)

**Response (200):**

```json
{
	"data": {
		"byType": {
			"error": 1,
			"info": 4,
			"success": 3,
			"warning": 2
		},
		"read": 7,
		"total": 10,
		"unread": 3
	},
	"message": "Notification statistics retrieved successfully",
	"success": true
}
```

### GET /api/v1/notifications/unread-count

Get unread notification count.

**Access:** VIEWER+

**Response (200):**

```json
{
	"data": {
		"count": 3
	},
	"message": "Unread count retrieved successfully",
	"success": true
}
```

### GET /api/v1/notifications/:id

Get notification by ID.

**Access:** VIEWER+ (users can only access their own notifications unless SYSOP/ADMIN)

**Response (200):**

```json
{
	"data": {
		"notification": {
			"createdAt": "2024-01-01T00:00:00.000Z",
			"id": 1,
			"isRead": false,
			"message": "Your account has been created successfully",
			"title": "Welcome!",
			"type": "SUCCESS",
			"userId": 1
		}
	},
	"message": "Notification retrieved successfully",
	"success": true
}
```

### POST /api/v1/notifications

Create a new notification.

**Access:** All authenticated users

**Request Body:**

```json
{
	"message": "The system will be updated tonight at 2 AM",
	"title": "System Update",
	"type": "INFO",
	"userId": 1
}
```

**Response (201):**

```json
{
	"data": {
		"notification": {
			"createdAt": "2024-01-01T00:00:00.000Z",
			"id": 2,
			"isRead": false,
			"message": "The system will be updated tonight at 2 AM",
			"title": "System Update",
			"type": "INFO",
			"userId": 1
		}
	},
	"message": "Notification created successfully",
	"success": true
}
```

### POST /api/v1/notifications/broadcast

Broadcast notification to all users or specific role.

**Access:** ADMIN+

**Request Body:**

```json
{
	"message": "System maintenance scheduled",
	"roleFilter": "OPERATOR",
	"title": "Maintenance Notice",
	"type": "WARNING"
}
```

**Response (200):**

```json
{
	"data": {
		"count": 3
	},
	"message": "Notification broadcast successfully",
	"success": true
}
```

### PUT /api/v1/notifications/:id/read

Mark notification as read.

**Access:** VIEWER+ (users can only mark their own notifications unless SYSOP/ADMIN)

**Response (200):**

```json
{
	"message": "Notification marked as read",
	"success": true
}
```

### PUT /api/v1/notifications/read-all

Mark all unread notifications as read for the authenticated user.

**Access:** VIEWER+

**Response (200):**

```json
{
	"data": {
		"count": 5
	},
	"message": "Notifications marked as read",
	"success": true
}
```

### DELETE /api/v1/notifications/:id

Delete notification.

**Access:** VIEWER+ (users can only delete their own notifications unless SYSOP/ADMIN)

**Response (200):**

```json
{
	"message": "Notification deleted successfully",
	"success": true
}
```

### POST /api/v1/notifications/bulk-delete

Bulk delete notifications (POST for reliable body handling).

**Access:** VIEWER+

**Request Body:**

```json
{
	"ids": [1, 2, 3]
}
```

**Response (200):**

```json
{
	"data": {
		"count": 3
	},
	"message": "Notifications deleted successfully",
	"success": true
}
```

---

## ⚙️ Settings Management

### GET /api/v1/settings

List all system settings.

**Access:** ADMIN, SYSOP

**Response (200):**

```json
{
	"data": [
		{
			"description": "Display name for application",
			"key": "app.name",
			"updatedAt": "2026-01-10T08:00:00Z",
			"updatedBy": 1,
			"value": "My Application"
		}
	],
	"message": "OK",
	"success": true
}
```

### GET /api/v1/settings/:key

Get specific setting by key.

**Access:** OPERATOR+

**Response (200):**

```json
{
	"data": {
		"description": "Display name for application",
		"key": "app.name",
		"updatedAt": "2026-01-10T08:00:00Z",
		"updatedBy": 1,
		"value": "My Application"
	},
	"message": "OK",
	"success": true
}
```

### PUT /api/v1/settings/:key

Create or update setting.

**Access:** ADMIN+

**Request Body:**

```json
{
	"description": "Display name for application",
	"value": "Updated Application Name"
}
```

**Response (200):**

```json
{
	"data": {
		"description": "Display name for application",
		"key": "app.name",
		"updatedAt": "2026-01-15T14:30:00Z",
		"updatedBy": 1,
		"value": "Updated Application Name"
	},
	"message": "OK",
	"success": true
}
```

### GET /api/v1/settings/user

Get user UI settings.

**Access:** All authenticated users

**Response (200):**

```json
{
	"data": {
		"appTheme": "default",
		"containerWidth": "centered",
		"dateFormat": "MM/DD/YYYY",
		"density": "comfortable",
		"language": "en",
		"layoutMode": "sidebar",
		"sidebarCollapsed": false,
		"theme": "system",
		"timeFormat": "HH:mm",
		"timezone": "America/New_York"
	},
	"message": "OK",
	"success": true
}
```

### PUT /api/v1/settings/user

Update user UI settings (partial updates supported).

**Access:** All authenticated users

**Request Body:**

```json
{
	"appTheme": "ocean",
	"containerWidth": "full-width",
	"density": "compact",
	"theme": "dark"
}
```

**Response (200):**

```json
{
	"data": {
		"appTheme": "ocean",
		"containerWidth": "full-width",
		"dateFormat": "MM/DD/YYYY",
		"density": "compact",
		"language": "en",
		"layoutMode": "sidebar",
		"sidebarCollapsed": false,
		"theme": "dark",
		"timeFormat": "HH:mm",
		"timezone": "America/New_York"
	},
	"message": "OK",
	"success": true
}
```

---

---

## ❌ Error Handling

### Common HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

### Error Response Examples

**Validation Error (400):**

```json
{
	"code": "VALIDATION_FAILED",
	"error": "Validation failed",
	"message": "Email is required"
}
```

**Authentication Error (401):**

```json
{
	"code": "AUTH_FAILED",
	"error": "Authentication failed",
	"message": "Invalid credentials"
}
```

**Authorization Error (403):**

```json
{
	"code": "FORBIDDEN",
	"error": "Insufficient permissions",
	"message": "You do not have permission to access this resource"
}
```

**Rate Limit Error (429):**

```json
{
	"code": "RATE_LIMIT_EXCEEDED",
	"error": "Too many requests",
	"message": "Rate limit exceeded. Please try again later."
}
```

---

### PUT /api/v1/users/me

Update own profile (cannot change role).

**Access:** All authenticated users

**Request Body:**

```json
{
	"email": "my@example.com",
	"username": "myusername"
}
```

**Response (200):**

```json
{
	"data": {
		"user": {
			"createdAt": "2024-01-01T00:00:00.000Z",
			"email": "my@example.com",
			"id": 1,
			"role": "ADMIN",
			"updatedAt": "2024-01-01T01:00:00.000Z",
			"username": "myusername"
		}
	},
	"message": "Profile updated successfully",
	"success": true
}
```

---

## OAuth Authentication

### List Enabled OAuth Providers

**GET** `/auth/oauth/providers`

**Required Role:** None (public endpoint)

**Response (200):**

```json
{
	"data": {
		"providers": ["github", "google"]
	},
	"success": true
}
```

Returns the list of OAuth providers enabled in the server configuration.

---

### Initiate OAuth Login

**GET** `/auth/oauth/:provider`

**Required Role:** None (public endpoint)

**Path Parameters:**

- `provider` (string): OAuth provider name (e.g., `github`, `google`)

**Response (200):**

```json
{
	"data": {
		"url": "https://github.com/login/oauth/authorize?client_id=abc&state=xyz"
	},
	"success": true
}
```

Returns the OAuth authorization URL for the specified provider. Returns 404 if the provider is not enabled.

---

### OAuth Callback

**GET** `/auth/oauth/:provider/callback`

**Required Role:** None (public endpoint)

**Query Parameters:**

- `code` (string, optional): Authorization code from OAuth provider
- `error` (string, optional): Error message from OAuth provider
- `state` (string, optional): State parameter for CSRF protection

Handles the OAuth callback after the user authorizes with an external provider. Exchanges the authorization code for tokens, creates or links the user account, sets auth cookies, and redirects to `/dashboard`. Returns 400 with `AUTH_OAUTH_FAILED` if the code is missing or the exchange fails.

---

## User API Keys

### List API Keys

**GET** `/users/:id/api-keys`

**Required Role:** Authenticated user (own keys) or ADMIN+ (any user's keys)

**Path Parameters:**

- `id` (number, minimum: 1): User ID

**Response (200):**

```json
{
	"data": [
		{
			"createdAt": "2026-02-04T00:00:00Z",
			"createdBy": 1,
			"expiresAt": null,
			"id": 1,
			"isActive": true,
			"keyName": "Production API Key",
			"keyScope": "read",
			"lastUsedAt": "2026-02-04T00:00:00Z"
		}
	],
	"success": true
}
```

Returns all API keys for a user (without the actual key or hash).

---

### Create API Key

**POST** `/users/:id/api-keys`

**Required Role:** Authenticated user (own keys) or ADMIN+ (any user's keys)

**Path Parameters:**

- `id` (number, minimum: 1): User ID

**Request Body:**

```json
{
	"expiresAt": "2027-01-01T00:00:00Z",
	"keyName": "My API Key",
	"scope": "read"
}
```

| Field       | Type   | Required | Description                                   |
| ----------- | ------ | -------- | --------------------------------------------- |
| `keyName`   | string | Yes      | Key name (1-100 chars)                        |
| `scope`     | string | No       | `read`, `write`, or `admin` (default: `read`) |
| `expiresAt` | string | No       | ISO 8601 expiry date                          |

**Response (201):**

```json
{
	"data": {
		"apiKey": "a1b2c3d4e5f6...",
		"apiKeySecret": "x9y8z7w6v5u4t3s2...",
		"keyData": {
			"id": 1,
			"isActive": true,
			"keyName": "My API Key",
			"keyScope": "read"
		}
	},
	"success": true
}
```

The API key and secret are returned **only once** -- store them securely. Cannot create a key with scope higher than your role level.

---

### Revoke API Key

**DELETE** `/users/:id/api-keys/:keyId`

**Required Role:** Authenticated user (own keys) or ADMIN+ (any user's keys)

**Path Parameters:**

- `id` (number, minimum: 1): User ID
- `keyId` (number, minimum: 1): API Key ID

**Response (200):**

```json
{
	"success": true
}
```

Soft-deactivates an API key. The key can no longer be used for authentication.

---

## User Bulk Operations

### Bulk Delete Users

**POST** `/users/bulk-delete`

**Required Role:** ADMIN+

**Request Body:**

```json
{
	"ids": [2, 3, 4]
}
```

| Field | Type     | Required | Description                    |
| ----- | -------- | -------- | ------------------------------ |
| `ids` | number[] | Yes      | User IDs to delete (minimum 1) |

**Response (200):**

```json
{
	"data": {
		"failed": 1,
		"results": [
			{ "id": 2, "success": true },
			{
				"error": "Cannot delete user with equal or higher role level",
				"id": 3,
				"success": false
			}
		],
		"succeeded": 1,
		"total": 2
	},
	"success": true
}
```

Each user is processed individually with same authorization checks as single DELETE. Returns partial success results.

---

### Bulk Update User Roles

**PUT** `/users/bulk/roles`

**Required Role:** ADMIN+

**Request Body:**

```json
{
	"updates": [
		{ "id": 2, "role": "OPERATOR" },
		{ "id": 3, "role": "MANAGER" }
	]
}
```

**Response (200):**

```json
{
	"data": {
		"failed": 1,
		"results": [
			{ "id": 2, "success": true },
			{
				"error": "Cannot assign role equal to or higher than your own",
				"id": 3,
				"success": false
			}
		],
		"succeeded": 1,
		"total": 2
	},
	"success": true
}
```

Each update is processed individually. Cannot modify users with a role equal to or higher than your own.

---

## Workspaces

All workspace endpoints require authentication. Workspace ID is passed via the `X-Workspace-ID` request header.

### List Workspaces

**GET** `/workspaces`

**Required Role:** Authenticated user (any role)

Returns all workspaces the authenticated user is a member of. SYSOP users see all workspaces regardless of membership.

**Response (200):**

```json
{
	"data": [
		{
			"description": "Engineering team workspace",
			"id": 1,
			"name": "Engineering",
			"ownerId": 1,
			"slug": "engineering"
		}
	],
	"success": true
}
```

---

### Get Workspace

**GET** `/workspaces/:id`

**Required Role:** Workspace member (any workspace role) or SYSOP

**Path Parameters:**

- `id` (number, minimum: 1): Workspace ID

**Response (200):**

```json
{
	"data": {
		"createdAt": "2026-01-10T08:00:00.000Z",
		"description": "Engineering team workspace",
		"id": 1,
		"name": "Engineering",
		"ownerId": 1,
		"slug": "engineering",
		"updatedAt": "2026-01-10T08:00:00.000Z"
	},
	"success": true
}
```

---

### Create Workspace

**POST** `/workspaces`

**Required Role:** Global ADMIN+

**Request Body:**

```json
{
	"description": "Design team workspace",
	"name": "Design",
	"slug": "design"
}
```

| Field         | Type   | Required | Description           |
| ------------- | ------ | -------- | --------------------- |
| `name`        | string | Yes      | Workspace name        |
| `slug`        | string | Yes      | Unique workspace slug |
| `description` | string | No       | Workspace description |

**Response (201):** Returns the created workspace. Triggers analytics event `workspace_created`.

---

### Update Workspace

**PUT** `/workspaces/:id`

**Required Role:** Workspace ADMIN or Global ADMIN+

**Request Body:**

```json
{
	"description": "Updated description",
	"name": "Engineering (Renamed)"
}
```

Slug cannot be changed via this endpoint.

---

### Delete Workspace

**DELETE** `/workspaces/:id`

**Required Role:** Global ADMIN+

Soft-deletes a workspace (marks as deleted, preserves data).

---

### Get Workspace Members

**GET** `/workspaces/:id/members`

**Required Role:** Workspace member (any workspace role) or SYSOP

**Response (200):**

```json
{
	"data": [
		{
			"email": "admin@example.com",
			"role": "ADMIN",
			"userId": 1,
			"username": "admin"
		}
	],
	"success": true
}
```

---

### Add Workspace Member

**POST** `/workspaces/:id/members`

**Required Role:** Global ADMIN+

**Request Body:**

```json
{
	"role": "OPERATOR",
	"userId": 4
}
```

| Field    | Type   | Required | Description                                              |
| -------- | ------ | -------- | -------------------------------------------------------- |
| `userId` | number | Yes      | User ID to add                                           |
| `role`   | string | Yes      | Workspace role: `ADMIN`, `MANAGER`, `OPERATOR`, `VIEWER` |

**Response:** 201 Created. Returns 409 if user is already a member.

---

### Remove Workspace Member

**DELETE** `/workspaces/:id/members/:userId`

**Required Role:** Global ADMIN+

---

### Update Workspace Member Role

**PUT** `/workspaces/:id/members/:userId/role`

**Required Role:** Global ADMIN+

**Request Body:**

```json
{
	"role": "MANAGER"
}
```

---

### Bulk Add Workspace Members

**POST** `/workspaces/:id/members/bulk`

**Required Role:** Global ADMIN+

**Maximum Batch Size:** 100 items

**Request Body:**

```json
{
	"members": [
		{ "role": "OPERATOR", "userId": 4 },
		{ "role": "VIEWER", "userId": 5 }
	]
}
```

**Response (200):**

```json
{
	"data": {
		"failed": 1,
		"results": [
			{ "success": true, "userId": 4 },
			{ "error": "User is already a member", "success": false, "userId": 5 }
		],
		"succeeded": 1,
		"total": 2
	},
	"success": true
}
```

---

### Bulk Remove Workspace Members

**DELETE** `/workspaces/:id/members/bulk`

**Required Role:** Global ADMIN+

**Maximum Batch Size:** 100 items

**Request Body:**

```json
{
	"userIds": [4, 99]
}
```

Returns partial success results in the same format as bulk add.

---

## Dashboard Management

### List Dashboards

**GET** `/dashboards/`

**Required Role:** Authenticated user (any role)

Returns all dashboards owned by the authenticated user (metadata only, no widgets).

---

### Get Dashboard

**GET** `/dashboards/:id`

**Required Role:** Authenticated user (must be owner)

Returns a dashboard with all its widget configurations.

**Response (200):**

```json
{
	"data": {
		"id": 1,
		"name": "My Dashboard",
		"widgets": [
			{
				"col": 0,
				"height": 2,
				"id": 1,
				"metricType": "cpu_usage",
				"row": 0,
				"title": "CPU Usage",
				"widgetType": "gauge",
				"width": 3
			}
		]
	},
	"success": true
}
```

---

### Create Dashboard

**POST** `/dashboards/`

**Required Role:** Authenticated user (any role)

**Request Body:**

```json
{
	"name": "My Dashboard",
	"widgets": [
		{
			"col": 0,
			"height": 2,
			"metricType": "cpu_usage",
			"options": {},
			"refreshInterval": 30,
			"row": 0,
			"timeRange": "1h",
			"title": "CPU Usage",
			"widgetType": "gauge",
			"width": 3
		}
	]
}
```

| Field                       | Type    | Required | Description                        |
| --------------------------- | ------- | -------- | ---------------------------------- |
| `name`                      | string  | Yes      | Dashboard name (1-100 chars)       |
| `widgets`                   | array   | No       | Array of widget configurations     |
| `widgets[].title`           | string  | Yes      | Widget title (1-100 chars)         |
| `widgets[].widgetType`      | string  | Yes      | Widget type (see WIDGET_TYPES)     |
| `widgets[].metricType`      | string  | Yes      | Metric type (see METRIC_TYPES)     |
| `widgets[].row`             | integer | Yes      | Grid row position (>= 0)           |
| `widgets[].col`             | integer | Yes      | Grid column position (>= 0)        |
| `widgets[].width`           | integer | Yes      | Widget width (1-12)                |
| `widgets[].height`          | integer | Yes      | Widget height (>= 1)               |
| `widgets[].timeRange`       | string  | No       | Time range filter                  |
| `widgets[].refreshInterval` | integer | No       | Refresh interval in seconds (>= 5) |
| `widgets[].options`         | object  | No       | Additional widget options          |

**Response:** 201 Created with the dashboard data.

---

### Update Dashboard

**PUT** `/dashboards/:id`

**Required Role:** Authenticated user (must be owner)

Same body schema as Create. When widgets are provided, all existing widgets are replaced.

---

### Delete Dashboard

**DELETE** `/dashboards/:id`

**Required Role:** Authenticated user (must be owner)

Deletes a dashboard and all its widgets.

---

### Share Dashboard

**POST** `/dashboards/:id/share`

**Required Role:** ADMIN+

**Request Body:**

```json
{
	"expiresInDays": 30
}
```

| Field           | Type    | Required | Description                                   |
| --------------- | ------- | -------- | --------------------------------------------- |
| `expiresInDays` | integer | No       | Days until share expires (1-365, default: 30) |

**Response (200):**

```json
{
	"data": {
		"shareExpiresAt": "2026-03-05T10:00:00.000Z",
		"shareToken": "abc123..."
	},
	"success": true
}
```

Generates a share token for read-only access via `/dashboards/shared/:token`.

---

### Export Dashboard

**GET** `/dashboards/:id/export`

**Required Role:** Authenticated user (must be owner)

Returns a portable JSON structure that can be imported into another instance.

---

### View Shared Dashboard

**GET** `/dashboards/shared/:token`

**Required Role:** None (public endpoint)

Returns a shared dashboard with widgets if the token is valid and not expired.

---

### List Dashboard Templates

**GET** `/dashboards/templates`

**Required Role:** Authenticated user (any role)

Returns available dashboard templates for quick setup.

---

### Create Dashboard from Template

**POST** `/dashboards/from-template`

**Required Role:** Authenticated user (any role)

**Request Body:**

```json
{
	"templateId": "system_overview"
}
```

**Response:** 201 Created with the dashboard data.

---

### Import Dashboard

**POST** `/dashboards/import`

**Required Role:** Authenticated user (any role)

**Request Body:**

```json
{
	"name": "Imported Dashboard",
	"version": 1,
	"widgets": []
}
```

Validates the schema before creating the dashboard. Widget schema is the same as Create Dashboard.

---

## Files

All file endpoints use the `X-Workspace-ID` header to scope file operations to a workspace. SYSOP users bypass workspace scoping.

### Upload File

**POST** `/files/upload`

**Required Role:** Authenticated user (any role)

**Request Body:** `multipart/form-data` with a `file` field

**Response (201):**

```json
{
	"data": {
		"createdAt": "2026-02-01T12:00:00.000Z",
		"id": 7,
		"mimeType": "application/pdf",
		"originalName": "report.pdf",
		"size": 245760,
		"uploadedBy": 1,
		"workspaceId": 1
	},
	"success": true
}
```

---

### Download File

**GET** `/files/:id`

**Required Role:** Authenticated user (any role)

Returns binary file content with appropriate `Content-Type` and `Content-Disposition` headers.

---

### Get File Metadata

**GET** `/files/:id/info`

**Required Role:** Authenticated user (any role)

Returns metadata without downloading the file content.

---

### List Files

**GET** `/files/`

**Required Role:** Authenticated user (any role)

**Query Parameters:**

| Parameter | Type   | Required | Description    |
| --------- | ------ | -------- | -------------- |
| `limit`   | number | No       | Max 100, min 1 |
| `offset`  | number | No       | Min 0          |

**Response (200):**

```json
{
	"data": {
		"files": [
			{
				"createdAt": "2026-02-01T12:00:00.000Z",
				"id": 7,
				"mimeType": "application/pdf",
				"originalName": "report.pdf",
				"size": 245760,
				"uploadedBy": 1
			}
		],
		"total": 15
	},
	"success": true
}
```

---

### Delete File

**DELETE** `/files/:id`

**Required Role:** Authenticated user (any role)

Soft-deletes a file (marks as deleted, preserves data).

---

## Tasks

Scheduled task management. All endpoints require ADMIN+ role.

### List Tasks

**GET** `/tasks/`

**Required Role:** ADMIN+

**Response (200):**

```json
{
	"data": [
		{
			"enabled": true,
			"lastRun": "2026-01-15T10:25:00Z",
			"name": "health-check",
			"nextRun": "2026-01-15T10:30:00Z",
			"schedule": "*/5 * * * *"
		}
	],
	"success": true
}
```

---

### Get Task History

**GET** `/tasks/:name/history`

**Required Role:** ADMIN+

Returns recent execution history for a specific task by name, including duration, status, and error messages.

---

### Trigger Task

**POST** `/tasks/:name/trigger`

**Required Role:** ADMIN+

Manually triggers immediate execution of a scheduled task, bypassing its configured interval. Returns 404 if the task name is not registered.

---

## Business Metrics

### Get Dashboard Stats

**GET** `/business-metrics/dashboard`

**Required Role:** OPERATOR+

**Query Parameters:**

| Parameter | Type   | Required | Description                          |
| --------- | ------ | -------- | ------------------------------------ |
| `days`    | number | No       | Lookback period (1-365, default: 30) |

**Response (200):**

```json
{
	"data": {
		"conversionRates": {
			"fileUploads": 42,
			"registrations": 8,
			"workspaceCreations": 5
		},
		"dailyActiveUsers": 12,
		"monthlyActiveUsers": 35,
		"topFeatures": [
			{ "count": 150, "eventName": "page_view" },
			{ "count": 42, "eventName": "file_uploaded" }
		],
		"totalEvents": 1250
	},
	"success": true
}
```

---

### Get Event Summary

**GET** `/business-metrics/events`

**Required Role:** OPERATOR+

**Query Parameters:**

| Parameter | Type   | Required | Description                          |
| --------- | ------ | -------- | ------------------------------------ |
| `days`    | number | No       | Lookback period (1-365, default: 30) |

Returns events grouped by category and name.

---

### Get User Activity

**GET** `/business-metrics/user-activity/:userId`

**Required Role:** ADMIN+

Returns activity metrics for a specific user including total events, breakdown by category, and recent events.

---

### Track Event

**POST** `/business-metrics/track`

**Required Role:** Authenticated user (any role)

**Request Body:**

```json
{
	"eventCategory": "feature_usage",
	"eventName": "page_view",
	"metadata": {}
}
```

| Field           | Type   | Required | Description                                          |
| --------------- | ------ | -------- | ---------------------------------------------------- |
| `eventCategory` | string | Yes      | One of: `user_action`, `conversion`, `feature_usage` |
| `eventName`     | string | Yes      | Event name (e.g., `page_view`, `login`)              |
| `metadata`      | object | No       | Additional event data                                |

The `userId` is automatically set from the authenticated user.

---

## Health Checks & Alerts

### Get Health Details

**GET** `/api/v1/health/details`

**Required Role:** OPERATOR+

Runs all health checks (database, memory, filesystem) and returns detailed results. Cached for 30 seconds.

**Response (200):**

```json
{
	"data": {
		"checks": [
			{
				"checkType": "database",
				"durationMs": 12,
				"message": "Database connection OK",
				"status": "healthy"
			}
		],
		"overall": "healthy"
	},
	"success": true
}
```

---

### Get Health History

**GET** `/api/v1/health/history`

**Required Role:** ADMIN+

Returns recent health check history (last 50 entries) and all active (unresolved) alerts. Cached for 5 minutes.

---

### Run Specific Health Check

**POST** `/api/v1/health/checks/:checkName/run`

**Required Role:** ADMIN+

**Path Parameters:**

- `checkName` (string): `database`, `memory`, or `filesystem`

Manually triggers a specific health check and creates a log entry. Creates an alert if the check fails.

---

### Acknowledge Alert

**POST** `/api/v1/health/alerts/:id/acknowledge`

**Required Role:** ADMIN+

Marks a health alert as acknowledged by the current user.

---

### Resolve Alert

**POST** `/api/v1/health/alerts/:id/resolve`

**Required Role:** ADMIN+

Marks a health alert as resolved. Resolved alerts are removed from the active alerts view.

---

### Cleanup Stale Alerts

**POST** `/api/v1/health/alerts/cleanup`

**Required Role:** ADMIN+

Resolves alerts active longer than the configured `logRetentionDays`.

---

### Delete Old Health Logs

**DELETE** `/api/v1/health/logs`

**Required Role:** ADMIN+

Deletes health check logs older than the configured retention period (default: 30 days).

---

### Get Health Config

**GET** `/api/v1/health/config`

**Required Role:** ADMIN+

Returns health check configuration including thresholds, enabled checks, and log retention policy.

---

### Update Health Config

**PUT** `/api/v1/health/config`

**Required Role:** SYSOP

**Request Body:**

```json
{
	"enabled": {
		"database": true,
		"filesystem": false,
		"memory": true
	},
	"logRetentionDays": 60,
	"memoryHeapDegradedThreshold": 0.9,
	"memoryHeapUnhealthyThreshold": 0.97
}
```

All fields are optional. Threshold values are applied immediately without service restart.

---

## System Backup

### Get Backup Status

**GET** `/system/backup/status`

**Required Role:** ADMIN+

Returns current backup status including last backup time, size, and available backup files. Cached for 5 minutes.

**Response (200):**

```json
{
	"data": {
		"backups": [
			{
				"createdAt": "2026-02-03T06:00:00.000Z",
				"filename": "backup-2026-02-03T06-00-00.db",
				"size": 2457600
			}
		],
		"lastBackupAt": "2026-02-03T06:00:00.000Z",
		"lastBackupSize": 2457600
	},
	"success": true
}
```

---

### Trigger Backup

**POST** `/system/backup/trigger`

**Required Role:** ADMIN+

Triggers an immediate database backup. Returns the backup path and size on success, or 500 if the backup fails.

---

### Restore from Backup

**POST** `/system/backup/restore`

**Required Role:** SYSOP only

**Request Body:**

```json
{
	"backupPath": "data/backups/backup-2026-02-03T06-00-00.db"
}
```

**This is a destructive operation** that replaces the current database. Returns 500 if the restore fails.

---

## Settings - SMTP & Email

### Get SMTP Configuration

**GET** `/settings/smtp/config`

**Required Role:** SYSOP

Returns SMTP configuration. Cached for 1 hour.

---

### Update SMTP Configuration

**PUT** `/settings/smtp/config`

**Required Role:** SYSOP

**Request Body:**

```json
{
	"fromAddress": "noreply@example.com",
	"fromName": "My App",
	"host": "smtp.gmail.com",
	"password": "app-password",
	"port": 587,
	"secure": true,
	"user": "myapp@gmail.com"
}
```

All fields are optional -- partial updates supported. Changes are logged in the audit trail.

---

### Send SMTP Test Email

**POST** `/settings/smtp/test`

**Required Role:** SYSOP

**Request Body:**

```json
{
	"message": "Custom message body",
	"subject": "Custom Subject",
	"testEmail": "test@example.com"
}
```

Returns 400 if SMTP is not configured, 500 if sending fails.

---

### Get Email Status

**GET** `/settings/email/status`

**Required Role:** ADMIN+

Returns whether SMTP is configured, can send emails, and last test result. Cached for 1 hour.

---

### Send Test Email

**POST** `/settings/email/test`

**Required Role:** ADMIN+

**Request Body:**

```json
{
	"to": "test@example.com"
}
```

---

## Settings - Authentication Security

### Get Auth Security Settings

**GET** `/settings/auth-security`

**Required Role:** ADMIN+

**Response (200):**

```json
{
	"data": {
		"enableAccountLocking": true,
		"lockoutDurationMinutes": 15,
		"maxLoginAttempts": 5,
		"minPasswordAgeDays": 1,
		"passwordExpiryDays": 90,
		"requirePasswordChange": true
	},
	"success": true
}
```

---

### Update Auth Security Settings

**PUT** `/settings/auth-security`

**Required Role:** SYSOP

**Request Body:**

```json
{
	"enableAccountLocking": true,
	"lockoutDurationMinutes": 30,
	"maxLoginAttempts": 3,
	"minPasswordAgeDays": 0,
	"passwordExpiryDays": 60,
	"requirePasswordChange": false
}
```

All fields are optional. Changes are logged in the audit trail.

---

## Additional Endpoints

The following endpoints exist in the codebase but are not fully documented above. Refer to the OpenAPI spec at `/api/v1/docs/json` for complete details.

### Authentication

- **POST** `/api/v1/auth/verify-email` -- Verify email address with token
- **GET** `/api/v1/auth/registration-status` -- Check if self-registration is enabled and read effective public password-policy flags (public)
- **GET** `/api/v1/auth/security-health` -- Security health overview (ADMIN+)

### User Profile

- **PUT** `/api/v1/users/me` -- Update own profile (username, email)
- **PUT** `/api/v1/users/me/password` -- Change own password (requires current password)
- **GET** `/api/v1/users/check-username/:username` -- Check username availability

### Notifications

- **PUT** `/api/v1/notifications/read-all` -- Mark all notifications as read
- **GET** `/api/v1/notifications/preferences` -- Get notification preferences
- **PUT** `/api/v1/notifications/preferences` -- Update notification preferences

### Settings

- **GET** `/api/v1/settings/app-features` -- Get application feature flags

### Other

- `/api/v1/onboarding` -- Onboarding flow endpoints
- `/api/v1/database-admin` -- Database administration endpoints (SYSOP)
- `/api/v1/bugs` -- Bug reporting endpoints

---

**For more detailed examples and frontend integration patterns, see:**

- [Developer Guide](DEVELOPMENT.md)
- [Security Guide](SECURITY.md)
- [RBAC Documentation](RBAC.md)
