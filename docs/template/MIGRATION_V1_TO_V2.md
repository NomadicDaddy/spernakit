# Spernakit v1 to v2 — Developer Reorientation Guide

This document maps v1 concepts, files, and patterns to their v2 equivalents. If you worked with Spernakit v1, use this as a lookup table to find where things moved and how patterns changed.

---

## Quick Reference Table

| What you did in v1                          | What you do in v2                                                    |
| ------------------------------------------- | -------------------------------------------------------------------- |
| Edit `backend/prisma/schema.prisma`         | Edit `backend/src/db/schema/*.ts`                                    |
| `bun run db:generate`                       | `bun run db:generate` (generates migration SQL from schema)          |
| `bun run db:migrate`                        | `bun run --cwd backend db:push` (dev) or `bun run db:migrate` (prod) |
| `bun run db:studio`                         | `bun run --cwd backend db:studio` (Drizzle Studio)                   |
| Create a controller in `controllers/`       | Add route handler directly in `routes/*.ts`                          |
| Add Express middleware in `middleware/`     | Add Elysia plugin in `plugins/`                                      |
| Use `authorize('ADMIN')` middleware         | Use `requireRole('ADMIN')` guard in route handler                    |
| `req.user` (global type augmentation)       | `user` from Elysia context (type-safe)                               |
| Import from `@prisma/client`                | Import from `../db/schema/*.ts` + `drizzle-orm`                      |
| `prisma.user.findMany()`                    | `db.select().from(users).all()`                                      |
| `prisma.user.create({ data })`              | `db.insert(users).values(data).returning().get()`                    |
| `prisma.user.update({ where, data })`       | `db.update(users).set(data).where(eq(users.id, id)).run()`           |
| Use Axios (`apiService.get()`)              | Use `apiClient.get<T>()` (native fetch)                              |
| `import apiService from './services/api'`   | `import { apiClient } from '@/api/client'`                           |
| Toast with `react-hot-toast`                | Toast with `sonner` (`toast()`, `toast.success()`)                   |
| DaisyUI classes (`btn btn-primary`, `card`) | shadcn/ui components (`<Button>`, `<Card>`)                          |
| `tailwind.config.js` with `module.exports`  | Tailwind v4 CSS-based config (`tailwind.css`)                        |
| Vitest for frontend tests                   | Vitest + jsdom (`bunx vitest run`); backend uses `bun test`          |
| Winston logger                              | Pino logger                                                          |
| `process.env.APP_NAME` in services          | JSON config via `configLoader`                                       |
| Manual form state (`useState` + `onChange`) | `react-hook-form` (`useForm()`, `register()`)                        |

---

## Backend Changes

### Directory Structure

```
v1 backend/src/                    v2 backend/src/
├── controllers/    ← REMOVED      ├── guards/         ← NEW
├── middleware/      ← RENAMED      ├── plugins/        ← RENAMED from middleware
├── routes/                        ├── routes/
├── services/                      ├── services/
├── swagger/        ← REMOVED      ├── storage/        ← NEW
├── types/                         ├── types/
├── utils/                         ├── utils/
├── config/                        ├── config/
├── constants/                     ├── constants/
└── app.ts                         ├── db/             ← NEW (was prisma/ at backend root)
                                   │   ├── schema/     ← Drizzle table definitions
                                   │   ├── index.ts    ← Database initialization
                                   │   └── seed.ts     ← Seed script
                                   └── app.ts
```

**Key moves**:

- `backend/prisma/` → `backend/src/db/` (schema is now TypeScript in `db/schema/`)
- `backend/src/controllers/` → removed (logic moved to `routes/` + `services/`)
- `backend/src/middleware/` → `backend/src/plugins/` (Elysia plugin pattern)
- `backend/src/swagger/` → removed (handled by `@elysiajs/swagger` plugin)
- `backend/src/guards/` → new (authorization guards extracted from middleware)
- `backend/src/storage/` → new (file storage adapters)

### Database Schema

**v1** — Prisma DSL (separate `.prisma` file):

```prisma
model User {
  id        Int      @id @default(autoincrement())
  username  String   @unique
  email     String   @unique
  role      String   @default("VIEWER")
  createdAt DateTime @default(now()) @map("created_at")
  @@map("users")
}
```

**v2** — Drizzle ORM (TypeScript):

```typescript
// backend/src/db/schema/users.ts
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	username: text('username').notNull().unique(),
	email: text('email').notNull().unique(),
	role: text('role').notNull().default('VIEWER'),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
});

export { users };
```

### Database Commands

| v1 Command                | v2 Command                              | Purpose                                    |
| ------------------------- | --------------------------------------- | ------------------------------------------ |
| `bun run db:generate`     | `bun run db:generate`                   | Generate migration SQL from schema changes |
| `bun run db:migrate`      | `bun run --cwd backend db:push` (dev)   | Apply schema changes in development        |
| `bun run db:migrate`      | `bun run db:migrate` (prod)             | Apply transaction-wrapped migrations       |
| `bun run db:migrate:init` | `bun run --cwd backend db:push`         | Initial schema creation (development)      |
| `bun run db:reset`        | Delete `data/*.db` + `bun run db:setup` | Reset database                             |
| `bun run db:seed`         | `bun run --cwd backend db:seed`         | Seed default data                          |
| `bun run db:studio`       | `bun run --cwd backend db:studio`       | Open database browser                      |

### Querying Data

**v1** — Prisma Client:

```typescript
// Find many with filter
const users = await prisma.user.findMany({
	where: { role: 'OPERATOR', isDeleted: false },
	orderBy: { createdAt: 'desc' },
	take: 10,
	skip: 0,
});

// Create
const user = await prisma.user.create({
	data: { username: 'newuser', email: 'new@example.com', role: 'VIEWER' },
});

// Update
await prisma.user.update({
	where: { id: 1 },
	data: { role: 'OPERATOR' },
});

// Soft delete
await prisma.user.update({
	where: { id: 1 },
	data: { isDeleted: true, deletedAt: new Date(), deletedBy: currentUserId },
});
```

**v2** — Drizzle ORM:

```typescript
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../db/index.ts';
import { users } from '../db/schema/users.ts';

const db = getDb();

// Find many with filter
const result = db
	.select()
	.from(users)
	.where(and(eq(users.role, 'OPERATOR'), eq(users.isDeleted, false)))
	.orderBy(desc(users.createdAt))
	.limit(10)
	.offset(0)
	.all();

// Create
const user = db
	.insert(users)
	.values({ username: 'newuser', email: 'new@example.com', role: 'VIEWER' })
	.returning()
	.get();

// Update
db.update(users).set({ role: 'OPERATOR' }).where(eq(users.id, 1)).run();

// Soft delete
db.update(users)
	.set({ isDeleted: true, deletedAt: new Date(), deletedBy: currentUserId })
	.where(eq(users.id, 1))
	.run();
```

### Routes and Controllers

**v1** — Express with separate controller:

```typescript
// backend/src/controllers/productController.ts
import { Request, Response } from 'express';
import { productService } from '../services/productService.ts';

export const createProduct = async (req: Request, res: Response) => {
	const product = await productService.create(req.body, req.user!.id);
	res.status(201).json({ success: true, data: product });
};

// backend/src/routes/productRoutes.ts
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.ts';
import { createProduct } from '../controllers/productController.ts';

const router = Router();
router.post('/', authenticate, authorize('OPERATOR'), createProduct);
export { router as productRoutes };
```

**v2** — Elysia route with inline handler:

```typescript
// backend/src/routes/products.ts
import { Elysia, t } from 'elysia';
import { requireRole } from '../guards/role.ts';
import { productService } from '../services/productService.ts';

const productRoutes = new Elysia({ prefix: '/products' }).post(
	'/',
	({ body, set, user }) => {
		const guard = requireRole('OPERATOR')({ set, user });
		if (guard) return guard;
		set.status = 201;
		return productService.create(body, user!.id);
	},
	{
		body: t.Object({
			name: t.String({ minLength: 1 }),
			price: t.Number({ minimum: 0 }),
		}),
	}
);

export { productRoutes };
```

**Key differences**:

- No separate controller file — handler is in the route definition
- Validation is co-located with the route via `t.Object()` (replaces Joi/express-validator)
- Authorization uses `requireRole()` guard inside the handler (not middleware in the chain)
- `user` comes from Elysia context (type-safe) instead of `req.user` (global augmentation)

### Authorization

**v1** — Express middleware:

```typescript
// Middleware chain
router.get('/admin', authenticate, authorize('ADMIN'), handler);

// middleware/authorization.ts
export const authorize =
	(...roles: string[]) =>
	(req, res, next) => {
		if (!roles.some((role) => hasPermission(req.user.role, role))) {
			return res.status(403).json({ error: 'Access denied' });
		}
		next();
	};
```

**v2** — Elysia guard:

```typescript
// Inside route handler
.get('/admin', ({ set, user }) => {
	const guard = requireRole('ADMIN')({ set, user });
	if (guard) return guard;
	// ... handler logic
})
```

### Logging

**v1** — Winston:

```typescript
import { logger } from '../utils/logger.ts';
logger.info('User created', { userId: 1 });
logger.error('Failed to create user', { error: err.message });
```

**v2** — Pino:

```typescript
import { logger } from '../utils/logger.ts';
logger.info({ userId: 1 }, 'User created');
logger.error({ error: err.message }, 'Failed to create user');
```

Note: Pino's argument order is reversed — context object first, message string second.

---

## Frontend Changes

### Directory Structure

```
v1 frontend/src/                   v2 frontend/src/
├── components/                    ├── api/            ← NEW (was services/)
│   ├── layout/                    ├── components/
│   ├── ui/                        │   ├── layout/
│   ├── dashboard/                 │   ├── ui/         ← shadcn/ui components
│   └── ...                        │   └── ...
├── contexts/                      ├── hooks/
├── hooks/                         ├── lib/            ← NEW (utils + formatters)
├── pages/                         ├── pages/
├── services/       ← MOVED        ├── stores/         ← NEW (was implicit context)
│   ├── api.ts      ← REPLACED     ├── App.tsx
│   └── wsClient.ts                ├── routes.tsx      ← NEW (separate routes file)
├── store/                         ├── main.tsx
├── test/                          └── tailwind.css
├── types/
├── utils/
├── App.tsx
└── main.tsx
```

**Key moves**:

- `frontend/src/services/api.ts` (Axios) → `frontend/src/api/client.ts` (native fetch)
- `frontend/src/services/*.ts` → `frontend/src/api/*.ts`
- `frontend/src/store/` → `frontend/src/stores/` (Zustand)
- `frontend/src/utils/` → partially moved to `frontend/src/lib/`
- Routes extracted to `frontend/src/routes.tsx`

### API Client

**v1** — Axios:

```typescript
import apiService from '../services/api';

// GET
const users = await apiService.get('/users');

// POST
const user = await apiService.post('/users', { username: 'new', role: 'VIEWER' });
```

**v2** — Native fetch via ApiClient:

```typescript
import { apiClient } from '@/api/client';

// GET
const users = await apiClient.get<UsersResponse>('/users');

// POST
const user = await apiClient.post<UserResponse>('/users', {
	body: { username: 'new', role: 'VIEWER' },
});
```

**Key differences**:

- Generic type parameter for response typing (`get<T>`)
- POST/PUT body is passed as `{ body: ... }` in the options object
- Query params are passed as `{ params: { page: '1' } }`
- No Axios interceptors — error handling is in `handleResponse()` and `fetchWithRefresh()`

### UI Components

**v1** — DaisyUI CSS classes:

```tsx
<button className="btn btn-primary">Save</button>
<div className="card bg-base-100 shadow-xl">
	<div className="card-body">
		<h2 className="card-title">Title</h2>
	</div>
</div>
<div className="alert alert-error">Error message</div>
<span className="loading loading-spinner loading-lg"></span>
```

**v2** — shadcn/ui components:

```tsx
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

<Button>Save</Button>
<Card>
	<CardHeader>
		<CardTitle>Title</CardTitle>
	</CardHeader>
	<CardContent>
		{/* content */}
	</CardContent>
</Card>
<Alert variant="destructive">
	<AlertDescription>Error message</AlertDescription>
</Alert>
```

**Key differences**:

- Components are imported from `@/components/ui/` (source files in your project)
- Props-based API instead of CSS class combinations
- Variants via `variant` prop instead of class suffixes (`btn-primary` → `variant="default"`)
- Icons from `lucide-react` (same library, unchanged from v1)

### Toast Notifications

**v1** — react-hot-toast:

```typescript
import toast from 'react-hot-toast';

toast.success('User created');
toast.error('Failed to create user');
toast('Neutral message');
```

**v2** — Sonner:

```typescript
import { toast } from 'sonner';

toast.success('User created');
toast.error('Failed to create user');
toast('Neutral message');
toast.promise(saveUser(), {
	loading: 'Saving...',
	success: 'Saved!',
	error: 'Failed to save',
});
```

The API is nearly identical. Sonner adds `toast.promise()` for async operations.

### Forms

**v1** — Manual state:

```tsx
const [formData, setFormData] = useState({ name: '', email: '' });

const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
	setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
};

<input name="name" value={formData.name} onChange={handleChange} />;
```

**v2** — react-hook-form:

```tsx
import { useForm } from 'react-hook-form';

const {
	register,
	handleSubmit,
	formState: { errors },
} = useForm<FormData>();

const onSubmit = (data: FormData) => {
	/* ... */
};

<form onSubmit={handleSubmit(onSubmit)}>
	<input {...register('name', { required: 'Name is required' })} />
	{errors.name && <span>{errors.name.message}</span>}
</form>;
```

### State Management

**v1** — React Context for everything:

```tsx
const { user, logout } = useAuth(); // from AuthContext
```

**v2** — Zustand stores:

```tsx
import { useAuthStore } from '@/stores/authStore';

const user = useAuthStore((state) => state.user);
const logout = useAuthStore((state) => state.logout);

// Or destructure (re-renders on any store change):
const { user, logout } = useAuthStore();
```

### Testing

**v1** — Vitest:

```typescript
// vitest.config.ts configuration
// Run: bunx vitest
```

**v2** — Bun test:

```typescript
// No separate config needed
// Run: bun test src
```

Test syntax is compatible — `describe`, `it`, `expect` work the same way.

---

## Configuration

No changes to the configuration approach — both v1 and v2 use JSON config files in `config/`. The config schema is similar but check `config/example.json` for v2-specific fields.

---

## Scripts

| v1 Script             | v2 Script                            | Notes                                          |
| --------------------- | ------------------------------------ | ---------------------------------------------- |
| `bun run init`        | `bun run setup` + `bun run db:setup` | Split into separate steps                      |
| `bun run dev`         | `bun run dev`                        | Same                                           |
| `bun run build`       | `bun run build`                      | Same                                           |
| `bun run smoke:qc`    | `bun run smoke:qc`                   | Same                                           |
| `bun run format`      | `bun run format`                     | Prisma format step removed                     |
| `bun run generate`    | Not needed                           | No Prisma client to generate                   |
| `bun run postinstall` | Not needed                           | No Prisma postinstall hook                     |
| `bun run squash-migs` | Regenerate via `db:generate`         | Delete old migrations + regenerate from schema |

---

## Package Dependencies Removed

These v1 dependencies are no longer needed in v2:

**Backend**:

- `express`, `@types/express` → Elysia
- `@prisma/client`, `@prisma/adapter-libsql`, `prisma` → Drizzle ORM
- `bcryptjs`, `@types/bcryptjs` → Bun native crypto
- `cors`, `@types/cors` → Elysia CORS plugin
- `helmet` → Elysia security headers plugin
- `compression`, `@types/compression` → Handled at nginx level
- `cookie-parser`, `@types/cookie-parser` → Elysia cookie handling
- `morgan`, `@types/morgan` → Pino logging
- `express-rate-limit` → Elysia rate limit plugin
- `joi` → Elysia `t.Object()` + Zod
- `validator`, `@types/validator` → Elysia type schemas
- `winston`, `winston-daily-rotate-file` → Pino
- `ws`, `@types/ws` → Bun native WebSocket
- `swagger-jsdoc`, `swagger-ui-express` → `@elysiajs/swagger`
- `tsx` → Bun runs TypeScript natively

**Frontend**:

- `axios` → Native fetch via ApiClient
- `react-hot-toast` → Sonner
- `uuid` → `crypto.randomUUID()` (built-in)
- `@vitest/coverage-v8` → Removed (Vitest + jsdom still used for frontend tests; backend uses `bun:test`)
- `terser` → Bun/Vite built-in minification
- `vite-plugin-compression` → Handled at nginx level
- `vite-bundle-analyzer` → Available via Vite flag when needed
- `babel-plugin-react-compiler` → Re-added (enabled in Vite config for automatic memoization)
- `cross-env` → Not needed (JSON config, no env vars)

---

## See Also

- [WHY_V2.md](WHY_V2.md) — Detailed rationale for each technology choice
- [STACK.md](STACK.md) — Canonical v2 tech stack reference
- [DEVELOPMENT.md](DEVELOPMENT.md) — v2 development patterns and best practices
