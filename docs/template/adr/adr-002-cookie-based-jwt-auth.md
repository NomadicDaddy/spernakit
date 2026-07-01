# ADR-002: Cookie-Based JWT Authentication (HTTP-Only)

## Status

Accepted

## Context

Authentication is a critical security requirement for enterprise applications. We needed an authentication system that:

- Provides strong security against common attacks (CSRF, XSS)
- Offers good user experience (persistent sessions)
- Integrates with modern RBAC system
- Is easy to implement and maintain
- Supports token-based stateless authentication
- Works well with both mobile and web clients

## Decision Drivers

- Security first: Must protect against XSS and CSRF attacks
- User experience: Persistent sessions without constant re-authentication
- Stateless: JWT tokens avoid session storage complexity
- Modern best practices: HTTP-only cookies, secure flags
- Simple implementation: Avoid overly complex authentication flows
- Role-based access: Must support 5-tier RBAC system

## Considered Alternatives

### Alternative 1: LocalStorage JWT Storage

Pros:

- Simple to implement (just `localStorage.setItem()`)
- No cookie configuration needed
- Works in all browsers
- Easy to access from JavaScript

Cons:

- **Vulnerable to XSS attacks**: Any malicious JavaScript can read tokens
- No automatic expiration handling in browsers
- No protection against CSRF (though less relevant without cookies)
- Requires manual refresh token management
- Security risk from third-party scripts on page

### Alternative 2: Session-Based Authentication (Server-Side Sessions)

Pros:

- Can invalidate sessions immediately on server
- Traditional, well-understood approach
- No JWT complexity
- Revocation is trivial (delete session record)

Cons:

- Requires session storage (Redis, database, in-memory)
- **Not stateless**: Requires database lookups for every request
- Scaling complexity: Need distributed session store for multiple servers
- Database overhead: Session table grows large
- Not ideal for monolithic deployment (adds storage requirement)
- More complex deployment (need Redis or similar)

### Alternative 3: Bearer Token in Authorization Header

Pros:

- Standard OAuth 2.0 approach
- Stateless
- Works well for APIs and mobile apps
- No cookie configuration needed

Cons:

- **Vulnerable to XSS if stored in localStorage**
- Must implement manual refresh token management
- Token exposure in browser developer tools
- No automatic token transmission (must add to each request manually)
- CSRF protection still needed if any cookie usage exists

### Alternative 4: Cookie-Based JWT with HTTP-Only (Selected)

Pros:

- **XSS protection**: HTTP-only cookies cannot be accessed by JavaScript
- **CSRF protection**: SameSite cookie attribute prevents cross-site requests
- Automatic transmission: Browser sends cookies automatically with requests
- Persistent sessions: Browser handles cookie storage and expiration
- **Stateless**: JWT contains all needed data, no server session storage
- Refresh token flow: Separate refresh token for seamless renewal
- Excellent security: Secure flag ensures HTTPS-only transmission
- Simple deployment: No Redis or session storage needed
- Works with monolithic architecture

Cons:

- Requires careful cookie configuration (SameSite, Secure, HttpOnly)
- Slightly more complex than localStorage approach
- Mobile apps need manual cookie handling (not automatic like browsers)
- Logout requires invalidating refresh token on server

## Decision Outcome

Chosen alternative: Cookie-based JWT authentication with HTTP-only cookies

**Why this alternative was chosen:**

1. **Best Security Profile**: HTTP-only cookies prevent XSS token theft. SameSite attribute prevents CSRF attacks. Secure flag ensures HTTPS-only transmission. This provides defense-in-depth against the two most common authentication attacks.

2. **Stateless Design**: JWT tokens contain user ID, role, token type, and expiration - no server-side session storage needed. Each request is authenticated by verifying the JWT signature, eliminating database lookups for session validation.

3. **Perfect for Monolithic Deployment**: Single-container application doesn't need Redis or distributed session storage. Authentication is completely self-contained.

4. **Excellent User Experience**: Browser automatically handles cookie storage and transmission. Users stay logged in across sessions with no visible authentication overhead.

5. **Simplifies Scaling**: When scaling from monolith to microservices, JWT tokens remain valid across services. No distributed session store migration needed.

6. **Compliance with Best Practices**: OWASP recommends HTTP-only cookies for session management. This approach aligns with industry security standards.

7. **Token Granularity**: Implementation uses two tokens:
    - Access token (short-lived: 15 minutes): JWT signed with ES256 (EC P-256), stored in HTTP-only cookie
    - Refresh token (long-lived: 7 days): JWT signed with separate ES256 key pair, stored in HTTP-only cookie, validated against database
      This provides security (short access token) and usability (long refresh token).

8. **Flexible Revocation**: Refresh tokens stored in database can be revoked for logout or security events. Access tokens automatically expire after 15 minutes.

## Implementation Details

### Access Token Flow

1. User logs in with credentials
2. Server validates credentials and generates access token (JWT with userId, role, 15min expiry)
3. Server sets HTTP-only cookie (configurable name, default `spernakit_auth`) with JWT payload
4. Browser automatically sends `accessToken` cookie on subsequent requests
5. Middleware verifies JWT signature on each request
6. No server-side session storage needed

### Refresh Token Flow

1. Access token expires (15 minutes)
2. Frontend calls `/api/v1/auth/refresh` endpoint
3. Server validates `refreshToken` cookie against database
4. If valid, server generates new access token and sets cookie
5. Refresh token rotated (new token generated, old invalidated)
6. User session continues seamlessly

### Logout Flow

1. User clicks logout
2. Frontend calls `/api/v1/auth/logout` endpoint
3. Server deletes refresh token from database
4. Server clears cookies (`expires: past date`)
5. Both tokens invalidated, user logged out

### CSRF Protection

- CSRF tokens generated per-user using HMAC with session-unique secrets
- Token format: `<timestamp_hex>.<nonce_hex>.<hmac_hex>` with configurable TTL (default: 4 hours)
- Exempt endpoints: `/auth/login`, `/auth/refresh`, `/auth/logout`
- CSRF token delivered via cookie, validated on state-changing requests

## Consequences

### Positive

- **Strong Security**: HTTP-only cookies prevent XSS, SameSite prevents CSRF
- **Stateless**: No Redis or session storage needed
- **Scalable**: JWT tokens work across services without distributed session store
- **Simple Deployment**: No additional infrastructure for authentication
- **Good UX**: Persistent sessions with seamless token refresh
- **Standards Compliant**: Aligns with OWASP and industry best practices
- **Flexible Revocation**: Refresh tokens in database allow immediate logout
- **Zero Configuration**: Works out of box with monolithic deployment

### Negative

- **Mobile Complexity**: Mobile apps need manual cookie handling (not automatic)
- **Cookie Configuration**: Requires careful setup (SameSite, Secure, HttpOnly)
- **Access Token Lifetime**: 15-minute expiration means some re-authentication if refresh fails
- **No Immediate Access Token Revocation**: Access tokens valid until expiration (mitigated by short 15min lifetime)

## Security Considerations

- **Cookie Security**: `Set-Cookie: accessToken=...; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=900`
- **Token Signing**: ES256 algorithm with EC P-256 key pairs from configuration
- **Refresh Token Storage**: Hashed in database for security
- **Failed Login Tracking**: Account lockout after 5 failed attempts (prevents brute force)
- **Password Hashing**: bcrypt with configurable cost factor (default: 12, minimum: 10)
- **HTTPS Required**: Secure flag only works with HTTPS (enforced in production)

## Related ADRs

- [ADR-003](adr-003-rbac-system.md): 5-tier RBAC system design for authorization
- [ADR-005](adr-005-json-configuration.md): JSON configuration for security keys
