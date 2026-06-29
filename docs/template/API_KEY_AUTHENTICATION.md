# API Key Authentication

## Overview

Spernakit supports two API key authentication modes, both using the `X-API-Key` header:

1. **Simple mode**: Send API key in X-API-Key header
2. **Signed mode** (recommended): Sign requests with HMAC-SHA256 for integrity and replay protection

### Scopes and Effective Role

Each key is created with a scope that maps to a role for authorization checks:

| Scope   | Effective role |
| ------- | -------------- |
| `read`  | VIEWER         |
| `write` | OPERATOR       |
| `admin` | ADMIN          |

- The effective role is **capped at the key owner's current role**: a key scoped above the owner's present privilege (e.g., after a demotion) acts at the owner's role instead.
- Keys belonging to soft-deleted or currently locked-out owners are rejected.
- API-key requests are **exempt from CSRF token validation** (header-based auth cannot be forged cross-origin by a browser), so `write` and `admin` keys work for POST/PUT/DELETE requests.

## Simple Mode

Send the API key directly in the X-API-Key header:

```http
X-API-Key: <api_key>
```

Simple mode is suitable for trusted environments or internal API calls. The key is sent in plaintext and can be replayed.

## Signed Mode (Recommended)

Signed mode provides cryptographic integrity proof and prevents replay attacks.

### API Key Format

When generating a new API key, you receive:

- `apiKey`: Public identifier (e.g., `a1b2c3d4e5f6...`)
- `apiKeySecret`: Secret for signing (e.g., `x9y8z7w6v5u4t3s2...`)

Store both values securely. The secret is returned only once.

### Request Signing

To sign a request:

1. **Generate a nonce**: A unique string for each request (UUID v4 recommended)
2. **Get timestamp**: Current Unix timestamp in seconds
3. **Create payload**: Join with newlines: `timestamp + "\n" + method + "\n" + path + "\n" + body`
4. **Generate signature**: HMAC-SHA256 of `payload` using `keySecret`

> **Newline delimiters**: The payload fields are separated by `\n` to prevent ambiguous concatenations (e.g., timestamp digits bleeding into the method).

> **Path construction**: The path must include the query string if present. For example, `/api/users?page=1` not just `/api/users`.

### Headers

Include these headers in your request:

```http
X-API-Key: <api_key>
X-API-Signature: <sha256_signature>
X-API-Timestamp: <unix_timestamp_in_seconds>
X-API-Nonce: <unique_nonce>
```

### Example: GET Request

```javascript
import { createHmac } from 'node:crypto';

const apiKey = 'a1b2c3d4e5f6...';
const apiKeySecret = 'x9y8z7w6v5u4t3s2...';
const method = 'GET';
const path = '/api/users/1';
const body = '';
const timestamp = Math.floor(Date.now() / 1000);
const nonce = crypto.randomUUID();

const payload = `${timestamp}\n${method}\n${path}\n${body}`;
const signature = createHmac('sha256', apiKeySecret).update(payload).digest('hex');

const response = await fetch('http://localhost:3331' + path, {
	method,
	headers: {
		'X-API-Key': apiKey,
		'X-API-Signature': signature,
		'X-API-Timestamp': timestamp.toString(),
		'X-API-Nonce': nonce,
	},
});
```

### Example: POST Request

```javascript
import { createHmac } from 'node:crypto';

const apiKey = 'a1b2c3d4e5f6...';
const apiKeySecret = 'x9y8z7w6v5u4t3s2...';
const method = 'POST';
const path = '/api/users';
const body = JSON.stringify({ username: 'newuser', password: 'secure123' });
const timestamp = Math.floor(Date.now() / 1000);
const nonce = crypto.randomUUID();

const payload = `${timestamp}\n${method}\n${path}\n${body}`;
const signature = createHmac('sha256', apiKeySecret).update(payload).digest('hex');

const response = await fetch('http://localhost:3331' + path, {
	method,
	headers: {
		'X-API-Key': apiKey,
		'X-API-Signature': signature,
		'X-API-Timestamp': timestamp.toString(),
		'X-API-Nonce': nonce,
		'Content-Type': 'application/json',
	},
	body,
});
```

## Security Features

### Timestamp Validation

- Server rejects requests with timestamps outside a ±5 minute window
- Prevents replay of old requests
- Client and server clocks must be synchronized within 5 minutes

### Nonce Tracking

- Server stores each nonce with 5-minute expiry
- Prevents duplicate submission of the same request
- Unique nonce per request ensures each request is fresh

### Constant-Time Comparison

- Server uses `crypto.timingSafeEqual()` to compare signatures
- Prevents timing attacks on signature verification

## Client Libraries

### TypeScript Client

```typescript
import { createHmac, randomUUID } from 'node:crypto';

class ApiKeyClient {
	constructor(
		private apiKey: string,
		private apiKeySecret: string,
		private baseUrl: string
	) {}

	private sign(method: string, path: string, body: string): Record<string, string> {
		const timestamp = Math.floor(Date.now() / 1000);
		const nonce = randomUUID();
		const payload = `${timestamp}\n${method}\n${path}\n${body}`;
		const signature = createHmac('sha256', this.apiKeySecret).update(payload).digest('hex');

		return {
			'X-API-Key': this.apiKey,
			'X-API-Signature': signature,
			'X-API-Timestamp': timestamp.toString(),
			'X-API-Nonce': nonce,
			'Content-Type': 'application/json',
		};
	}

	async request<T>(method: string, path: string, body?: unknown): Promise<T> {
		const bodyString = body ? JSON.stringify(body) : '';
		const headers = this.sign(method, path, bodyString);

		const response = await fetch(`${this.baseUrl}${path}`, {
			method,
			headers,
			body: bodyString || undefined,
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'API request failed');
		}

		return response.json();
	}

	async get<T>(path: string): Promise<T> {
		return this.request<T>('GET', path);
	}

	async post<T>(path: string, body: unknown): Promise<T> {
		return this.request<T>('POST', path, body);
	}

	async put<T>(path: string, body: unknown): Promise<T> {
		return this.request<T>('PUT', path, body);
	}

	async delete<T>(path: string): Promise<T> {
		return this.request<T>('DELETE', path);
	}
}

// Usage
const client = new ApiKeyClient('a1b2c3d4e5f6...', 'x9y8z7w6v5u4t3s2...', 'http://localhost:3331');

const users = await client.get('/api/users');
```

### Python Client

```python
import hmac
import json
import time
import uuid
from typing import Optional

import requests

class ApiKeyClient:
    def __init__(self, api_key: str, api_key_secret: str, base_url: str):
        self.api_key = api_key
        self.api_key_secret = api_key_secret
        self.base_url = base_url

    def _sign_request(self, method: str, path: str, body: str) -> dict:
        timestamp = int(time.time())
        nonce = str(uuid.uuid4())
        payload = f"{timestamp}\n{method}\n{path}\n{body}"
        signature = hmac.new(self.api_key_secret.encode(), payload.encode(), 'sha256').hexdigest()
        return {
            'X-API-Key': self.api_key,
            'X-API-Signature': signature,
            'X-API-Timestamp': str(timestamp),
            'X-API-Nonce': nonce,
        }

    def request(self, method: str, path: str, body: Optional[dict] = None):
        body_str = json.dumps(body) if body else ''
        headers = self._sign_request(method, path, body_str)
        url = f"{self.base_url}{path}"
        response = requests.request(method, url, headers=headers, data=body_str or None)
        response.raise_for_status()
        return response.json()

# Usage
client = ApiKeyClient(
    'a1b2c3d4e5f6...',
    'x9y8z7w6v5u4t3s2...',
    'http://localhost:3331'
)

users = client.request('GET', '/api/users')
```

## Error Codes

All API-key authentication failures (unknown/revoked/expired key, bad signature, stale timestamp, reused nonce, deleted or locked-out owner) resolve to an unauthenticated request. The route guard then returns `401 Unauthorized` with the generic code:

| Error Code           | Description                                         |
| -------------------- | --------------------------------------------------- |
| `AUTH_TOKEN_MISSING` | Authentication required (API-key validation failed) |

> **Note**: The codes `AUTH_API_KEY_SIGNATURE_INVALID`, `AUTH_API_KEY_TIMESTAMP_INVALID`, and `AUTH_API_KEY_NONCE_REUSED` are defined in `shared/src/errorCodes.ts` but are not currently emitted — failure causes are deliberately indistinguishable to callers.

## Best Practices

1. **Store secrets securely**: Never commit API keys or secrets to version control
2. **Regenerate periodically**: Rotate API keys regularly (e.g., every 90 days)
3. **Use minimal scope**: Grant only the necessary permissions (read, write, admin)
4. **Set expiration**: Use short expiration times for temporary API keys
5. **Monitor usage**: Review API key usage in audit logs
6. **Revoke unused keys**: Remove API keys that are no longer needed
7. **Keep clocks synchronized**: Ensure client and server clocks are within 5 minutes

## Troubleshooting

### Request fails with signature error

- Verify payload construction: newline-delimited `timestamp + "\n" + method + "\n" + path + "\n" + body`
- Ensure body is the exact string sent (including whitespace)
- Ensure the signature uses HMAC-SHA256 with the key secret, not a plain SHA-256 hash
- Check that path includes the query string (e.g., `/api/users?page=1`)
- Verify signature is hex-encoded

### Request rejected due to timestamp

- Check that client and server clocks are synchronized
- Ensure timestamp is in **seconds**, not milliseconds
- Use NTP to synchronize system time

### Request rejected due to nonce reuse

- Generate a unique nonce for each request
- Use UUID v4 or a cryptographically secure random string
- Never reuse nonces across requests

## References

- [OpenAPI Documentation](http://localhost:3331/api/v1/docs) (when running locally)
- [API Reference](API_REFERENCE.md)
- [Security](SECURITY.md)
