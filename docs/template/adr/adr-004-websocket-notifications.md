# ADR-004: WebSocket Real-Time Notifications

## Status

Accepted

## Context

Modern enterprise applications need real-time communication for:

- Instant notifications to users (security alerts, system updates, messages)
- Live dashboard updates (metrics, system health)
- Improved user experience (no manual refreshes)
- Reduced server load (no polling)

We needed a real-time communication system that:

- Works well with JWT authentication
- Integrates with existing RBAC system
- Is secure and scalable
- Simple to implement and maintain
- Works in both monolithic and microservice deployments

## Decision Drivers

- **Real-time delivery**: Users should see notifications instantly
- **Server efficiency**: No polling (reduces HTTP requests)
- **Security**: Must integrate with JWT authentication
- **Scalability**: Support concurrent connections
- **Simplicity**: Easy to implement without external message broker
- **Browser compatibility**: Works in all modern browsers
- **Monolithic-friendly**: Doesn't require Redis or external dependencies

## Considered Alternatives

### Alternative 1: Polling (HTTP Requests on Interval)

Pros:

- Very simple to implement
- Works in all browsers
- No WebSocket setup needed
- Easy to debug
- Works with existing HTTP infrastructure

Cons:

- **High server load**: Frequent HTTP requests even when no updates
- **Poor user experience**: Notifications delayed until next poll
- **Waste of bandwidth**: Empty responses when no new data
- **Scalability issues**: 1000 users polling every 30 seconds = 2000 req/min
- **Battery drain**: Mobile devices wake up frequently

### Alternative 2: Server-Sent Events (SSE)

Pros:

- Built-in browser support
- One-way communication (server → client)
- Easier than WebSockets
- Automatic reconnection
- Works through some proxies/firewalls

Cons:

- **One-way only**: Client cannot send events to server
- Limited browser support in older browsers (Safari had issues)
- No native binary data support
- Still requires fallback for older browsers
- Less flexible than WebSockets

### Alternative 3: Long Polling (Hanging GET)

Pros:

- Better than regular polling
- Works in all browsers
- Simpler than WebSockets

Cons:

- **Still HTTP overhead**: Each event requires new HTTP request
- Complex implementation (timeout handling, reconnection)
- Higher server load than WebSockets
- Connection management is tricky
- No true real-time (still has latency)

### Alternative 4: Socket.IO

Pros:

- Very popular and well-documented
- Automatic reconnection and fallback (long polling, polling)
- Rooms and namespaces for channel management
- Binary data support
- Easy API

Cons:

- **Overkill for single-server deployment**: Monolithic app doesn't need fallbacks
- **Additional dependency**: 74KB minified (large bundle)
- **Custom protocol**: Not standard WebSocket protocol
- **Performance overhead**: Abstraction layer adds latency
- **Version conflicts**: Client/server version must match exactly
- **Configuration complexity**: Many options to tune
- **Not required**: Native WebSocket API works well for our needs

### Alternative 5: Native WebSocket (Selected)

Pros:

- **Standard protocol**: Built into all modern browsers
- **Low overhead**: Binary protocol, minimal framing
- **Full-duplex**: Both server and client can send messages
- **Efficient**: Single connection for unlimited messages
- **No external dependencies**: Native browser API
- **Small bundle**: No Socket.IO library (~74KB saved)
- **Easy to secure**: Can validate JWT on connection
- **Perfect for monolith**: No need for Redis or message broker
- **Simple implementation**: 100-200 lines of code
- **Good performance**: Handles thousands of concurrent connections

Cons:

- **No automatic fallback**: Older browsers don't support (not a concern for modern apps)
- **Manual reconnection**: Must implement reconnect logic
- **No built-in rooms**: Must implement channel management
- **Firewall issues**: Some corporate firewalls block WebSocket traffic
- **Requires careful design**: Need pub/sub pattern for multi-client updates

## Decision Outcome

Chosen alternative: Native WebSocket with custom channel-based pub/sub

**Why this alternative was chosen:**

1. **Perfect for Monolithic Deployment**: Single server with WebSocket on the same Bun process as the Elysia API. No Redis, no message broker, no complexity.

2. **Performance**: Native WebSocket protocol is significantly faster than HTTP. Single connection handles unlimited messages. Zero HTTP overhead for notifications.

3. **Small Bundle Size**: No Socket.IO (~74KB). Reduces frontend bundle and improves load times.

4. **Simple Implementation**: Using Bun native WebSocket (built-in, zero dependencies). Total WebSocket implementation ~200 lines of code vs Socket.IO's complexity.

5. **Standards-Based**: Native WebSocket API is standard, well-documented, and future-proof. No custom protocol like Socket.IO.

6. **Secure Authentication**: JWT validation on WebSocket connection using HTTP-only cookies (same as API). Same security model as REST endpoints.

7. **RBAC Integration**: WebSocket connections validate user role and permissions. Channel-based access control ensures users only receive authorized notifications.

8. **Channel-Based Pub/Sub**: Custom implementation allows:
    - User-specific channels (`user:123`)
    - Workspace-scoped channels (`workspace:456`)
    - Broadcast to specific subsets

9. **Easy to Extend**: Adding new notification types just means using different channel names. No Socket.IO schema changes.

## Implementation Details

### Server-Side Architecture

```typescript
// Functional module-based pattern using Bun's native pub/sub

// Route handler: backend/src/routes/ws/ws.ts
// Uses Elysia's .ws() with upgrade, open, message, close handlers
app.ws('/ws', {
	upgrade: (req) => {
		// Validate origin header, check token revocation
		// Extract and validate JWT from cookie during upgrade
	},
	open: (ws) => {
		// Register connection in Map<connId, TrackedConnection>
		// Subscribe to user:{userId} and workspace:{workspaceId} channels
	},
	message: (ws, message) => {
		// Handle incoming messages (subscribe/unsubscribe, ping)
	},
	close: (ws) => {
		// Unsubscribe from all channels, remove from connection map
	},
});

// Broadcasting: backend/src/services/websocket/wsBroadcast.ts
// Functional exports (not a class)
broadcastToChannel(channel: string, message: WsMessage): void
broadcastToUser(userId: number, message: WsMessage): void

// Validation: backend/src/services/websocket/wsHelpers.ts
// Connection tracking via Map<connId, TrackedConnection>
```

### Client-Side Architecture

```typescript
// Frontend hook and singleton WebSocket client in frontend/src/lib/websocket/
// Uses getWsUrl() to dynamically construct URL from window.location
// Connected via useWebSocket() hook in AppShell.tsx

// Dynamic URL construction (not hardcoded)
function getWsUrl(): string {
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	return `${protocol}//${window.location.host}/ws`;
}

// Hook usage in AppShell.tsx
function AppShell() {
	useWebSocket(); // Singleton connection, auto-reconnect
	// ...
}
```

### Authentication Flow

1. Client connects to `ws://{host}:{port}/ws` (URL dynamically constructed from `window.location`)
2. Origin header validation occurs before authentication
3. Browser sends HTTP-only `accessToken` cookie with WebSocket upgrade request
4. Token revocation is checked during upgrade
5. Server validates JWT signature and extracts user info
6. If valid, connection accepted and user ID stored
7. If invalid, connection rejected with 401 error

### Channel Management

- **User Channels**: `user:{userId}` — Personal notifications
- **Workspace Channels**: `workspace:{workspaceId}` — Workspace-scoped updates
- **Channel Validation**: Pattern validated via regex: `/^(user|workspace):(\d+)$/`
- **Notification Service**: Creates notification in database, then broadcasts via WebSocket

## Consequences

### Positive

- **Real-time delivery**: Notifications appear instantly
- **Low server load**: No polling, single connection per user
- **Small bundle**: No Socket.IO dependency (~74KB saved)
- **Simple architecture**: No Redis, no message broker
- **Standards-based**: Native WebSocket protocol
- **Secure**: JWT integration with same authentication as API
- **Efficient**: Binary protocol, minimal overhead
- **Scalable**: Handles thousands of concurrent connections
- **Easy to debug**: Can log all WebSocket messages
- **Channel-based**: Flexible targeting (user, workspace)

### Negative

- **Manual reconnection**: Must implement reconnect logic (5-10 lines)
- **No fallback**: Older browsers not supported (IE11, Safari 9)
- **Firewall blocking**: Some corporate firewalls block WebSocket traffic
- **Complex testing**: WebSocket tests harder than HTTP tests
- **Connection management**: Must handle timeouts, disconnections, errors
- **No native rooms**: Must implement channel management

## Security Features

- **JWT Validation**: Every WebSocket connection validates JWT token
- **Cookie-Based Authentication**: Same HTTP-only cookie security as API
- **Channel Authorization**: Users can only subscribe to authorized channels
- **Rate Limiting**: WebSocket messages limited to prevent abuse
- **Connection Limits**: Maximum connections per user/IP enforced
- **Audit Logging**: All WebSocket events logged for security

## Future Enhancements

- **Redis Integration**: When scaling to microservices, add Redis pub/sub for cross-server broadcasting
- **Heartbeat Ping-Pong**: Detect stale connections and clean up
- **Binary Protocol**: Use MessagePack for smaller message sizes
- **Compression**: Compress WebSocket messages for large payloads

## Related ADRs

- [ADR-002](adr-002-cookie-based-jwt-auth.md): Cookie-based JWT authentication for WebSocket security
- [ADR-003](adr-003-rbac-system.md): RBAC system for channel authorization
