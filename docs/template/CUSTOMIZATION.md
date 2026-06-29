# Customization Guide

This guide shows you how to extend and customize the Spernakit template for your specific application needs.

## Table of Contents

1. [Application Branding](#application-branding)
2. [Port Configuration](#port-configuration)
3. [Adding New Features](#adding-new-features)
4. [Styling Customization](#styling-customization)
5. [Configuration Management](#configuration-management)
6. [User Profile Extensions](#user-profile-extensions)
7. [Advanced Customizations](#advanced-customizations)

---

## Core vs App-Specific Code Organization

When extending the template, maintain clear separation between template core and application-specific code:

### **Code Markers**

Use standardized banners to separate template core from application-specific sections:

```typescript
// ===== Template Core (Spernakit) =====
// Core template functionality here

// ===== App-Specific (Your App) =====
// Your custom application code here
```

```html
<!-- ===== Template Core (Spernakit) ===== -->
<!-- Core template HTML here -->

<!-- ===== App-Specific (Your App) ===== -->
<!-- Your custom HTML here -->
```

### **Organization Rules**

- **Template Core First**: Always place template code before app-specific code
- **No Interleaving**: Don't mix template and app code - append after the app-specific banner
- **Preserve Structure**: Keep banner comments even when sections are empty
- **Common Locations**: `backend/src/plugins/validation.ts`, shared configs, initializers

## Application Branding

### **JSON Configuration (no `.env`)**

Update your application identity and ports in `config/{appname}.json`:

```json
{
	"app": {
		"description": "The best application ever built",
		"name": "My Awesome Application",
		"slug": "my-awesome-app"
	},
	"database": {
		"url": "file:./data/my-awesome-app.db"
	},
	"security": {
		"cookieSecret": "<generated>",
		"encryptionKey": "<generated>",
		"jwtPrivateKey": "<generated>",
		"jwtPublicKey": "<generated>"
	},
	"server": {
		"backendPort": 3331,
		"frontendPort": 3330,
		"frontendUrl": "http://localhost:3330"
	}
}
```

- Run `bun run setup` to generate secure keys and the initial file.
- Adjust app name/slug, ports, and database path as needed.

### **Visual Identity**

1. **HTML Metadata**

    ```html
    <!-- frontend/index.html -->
    <title>My Awesome Application</title>
    <meta content="The best application ever built" name="description" />
    ```

2. **Favicon and Logo**
    - Replace `frontend/public/vite.svg` with your logo
    - Update favicon in `frontend/index.html`

3. **Navigation Branding**
    ```typescript
    // frontend/src/components/layout/Sidebar.tsx
    const appName = __APP_NAME__;
    ```

---

## Port Configuration

Default Spernakit ports (development):

- **Frontend**: `3330`
- **Backend API**: `3331`

**Change ports via JSON config**

Update `config/{appname}.json`:

```json
"server": {
  "frontendPort": 3330,
  "backendPort": 3331,
  "frontendUrl": "http://localhost:3330"
}
```

### **Verification**

```bash
# Start the application
bun run dev

# Check services
curl http://localhost:3331/api/v1/health
curl http://localhost:3330
```

### **Docker**

Ports are also respected in Docker/Nginx config; adjust compose/nginx settings if needed instead of source edits.

---

## Adding New Features

### **Complete Feature Implementation**

When adding new features, follow this comprehensive pattern:

#### **1. Database Schema**

Add your table to a new file in `backend/src/db/schema/`:

```typescript
// backend/src/db/schema/products.ts
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const products = sqliteTable(
	'products',
	{
		category: text('category').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		createdBy: integer('created_by').notNull(),
		deletedAt: integer('deleted_at', { mode: 'timestamp' }),
		deletedBy: integer('deleted_by'),
		description: text('description'),
		id: integer('id').primaryKey({ autoIncrement: true }),
		isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
		isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
		name: text('name').notNull(),
		price: real('price').notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => [
		index('idx_products_category').on(table.category),
		index('idx_products_is_deleted').on(table.isDeleted),
		index('idx_products_created_by').on(table.createdBy),
	]
);

export { products };
```

Then re-export from the barrel file:

```typescript
// backend/src/db/schema/index.ts
// ... existing exports
export { products } from './products.ts';
```

#### **2. Generate and Run a Migration**

```bash
# Generate migration SQL from Drizzle schema changes
bun run db:generate

# Apply pending migrations
bun run db:migrate
```

#### **3. Service Layer with Template Patterns**

Follow the template's established patterns for services. Simple services are flat files in `backend/src/services/` (e.g., `productService.ts`). Complex services with multiple related modules use a **subdirectory with a facade file** — the facade sits at the `services/` root and re-exports the public API from internal modules in the subdirectory (e.g., `services/authService.ts` + `services/auth/*.ts`). See [DEVELOPMENT.md](DEVELOPMENT.md#service-organization) for the full pattern:

```typescript
// backend/src/services/productService.ts
import { and, count, eq, sql } from 'drizzle-orm';

import { getDb } from '../db/index.ts';
import { products } from '../db/schema/products.ts';
import { logCreate, logDelete } from './auditService.ts';

interface CreateInput {
	category: string;
	description?: string;
	name: string;
	price: number;
}

function createProduct(data: CreateInput, userId: number) {
	const db = getDb();

	const product = db
		.insert(products)
		.values({
			...data,
			createdBy: userId,
		})
		.returning()
		.get();

	// Template pattern: Always log audit trail
	logCreate({
		newValues: data,
		resourceId: product.id,
		resourceType: 'PRODUCT',
		userId,
	});

	return product;
}

function getProducts(includeDeleted = false) {
	const db = getDb();
	const conditions = includeDeleted ? undefined : eq(products.isDeleted, false);

	return db
		.select()
		.from(products)
		.where(conditions)
		.orderBy(sql`${products.createdAt} DESC`)
		.all();
}

// Template pattern: Always use soft delete
function deleteProduct(id: number, userId: number) {
	const db = getDb();

	const existing = db.select().from(products).where(eq(products.id, id)).get();
	if (!existing) throw new Error('Product not found');

	const deleted = db
		.update(products)
		.set({
			deletedAt: new Date(),
			deletedBy: userId,
			isDeleted: true,
		})
		.where(eq(products.id, id))
		.returning()
		.get();

	logDelete({
		oldValues: existing,
		resourceId: id,
		resourceType: 'PRODUCT',
		userId,
	});

	return deleted;
}

export { createProduct, deleteProduct, getProducts };
```

#### **4. Routes**

Spernakit v3 uses Elysia routes directly -- there is no separate controllers directory. Business logic goes in services, route handlers stay thin:

```typescript
// backend/src/routes/products.ts
import { Elysia, t } from 'elysia';

import { assertUser, requireRole } from '../guards/role.ts';
import { authPlugin } from '../plugins/auth.ts';
import { createProduct, deleteProduct, getProducts } from '../services/productService.ts';
import { dataResponse, successResponse } from '../utils/apiResponse.ts';

const productRoutes = new Elysia({ detail: { tags: ['Products'] }, prefix: '/products' })
	.use(authPlugin)
	.get(
		'/',
		({ set, user }) => {
			const guard = requireRole('VIEWER')({ set, user });
			if (guard) return guard;

			return dataResponse(getProducts());
		},
		{ detail: { summary: 'List all products' } }
	)
	.post(
		'/',
		({ body, set, user }) => {
			const guard = requireRole('OPERATOR')({ set, user });
			if (guard) return guard;
			assertUser(user);

			const product = createProduct(body, user.id);
			set.status = 201;
			return dataResponse(product);
		},
		{
			body: t.Object({
				category: t.String({ minLength: 1 }),
				description: t.Optional(t.String()),
				name: t.String({ minLength: 1 }),
				price: t.Number({ minimum: 0 }),
			}),
			detail: { summary: 'Create a product' },
		}
	)
	.delete(
		'/:id',
		({ params, set, user }) => {
			const guard = requireRole('MANAGER')({ set, user });
			if (guard) return guard;
			assertUser(user);

			deleteProduct(Number(params.id), user.id);
			return successResponse();
		},
		{
			detail: { summary: 'Soft-delete a product' },
			params: t.Object({ id: t.String() }),
		}
	);

export { productRoutes };
```

```typescript
// backend/src/create-api-app.ts - Register routes via routePlugins array
import { productRoutes } from './routes/products.ts';

// Add to the routePlugins array in create-api-app.ts:
const routePlugins = [
	// ... existing route plugins
	productRoutes,
];
```

---

## Creating New Pages

### 1. Create TypeScript Types

```typescript
// frontend/src/types/product.ts
export interface Product {
	id: number;
	name: string;
	description?: string;
	price: number;
	category: string;
	isActive: boolean;
	createdBy: number;
	createdAt: string;
	updatedAt: string;
}

export interface CreateProductData {
	name: string;
	description?: string;
	price: number;
	category: string;
}
```

### 2. Create API Module

```typescript
// frontend/src/api/products.ts
import { apiClient } from './client';
import type { DataResponse, SuccessResponse } from './types';

interface Product {
	id: number;
	name: string;
	description?: string;
	price: number;
	category: string;
}

interface CreateProductData {
	name: string;
	description?: string;
	price: number;
	category: string;
}

function getProducts(): Promise<DataResponse<Product[]>> {
	return apiClient.get<DataResponse<Product[]>>('/products');
}

function createProduct(data: CreateProductData): Promise<DataResponse<Product>> {
	return apiClient.post<DataResponse<Product>>('/products', { body: data });
}

function updateProduct(
	id: number,
	data: Partial<CreateProductData>
): Promise<DataResponse<Product>> {
	return apiClient.put<DataResponse<Product>>(`/products/${id}`, { body: data });
}

function deleteProduct(id: number): Promise<SuccessResponse> {
	return apiClient.delete<SuccessResponse>(`/products/${id}`);
}

export { createProduct, deleteProduct, getProducts, updateProduct };
export type { CreateProductData, Product };
```

### 3. Create React Query Hooks

```typescript
// frontend/src/hooks/useProducts.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createProduct, getProducts, type CreateProductData, type Product } from '@/api/products';

export function useProducts() {
	return useQuery({
		queryFn: () => getProducts(),
		queryKey: ['products'],
	});
}

export function useCreateProduct() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: CreateProductData) => createProduct(data),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['products'] });
		},
	});
}
```

### 4. Create Page Component

```typescript
// frontend/src/pages/products/ProductsPage.tsx
import { useState } from 'react';
import { ShoppingBag } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useCreateProduct, useProducts } from '../../hooks/useProducts';
import { useAuth } from '../../hooks/useAuth';
import { hasPermission } from '../../utils/permissions';
import type { CreateProductData } from '../../types/product';

export function ProductsPage() {
	const { data: products = [], error, isLoading: loading } = useProducts();
	const createProductMutation = useCreateProduct();
	const { user } = useAuth();
	const [showCreateForm, setShowCreateForm] = useState(false);

	const handleCreateProduct = async (productData: CreateProductData) => {
		await createProductMutation.mutateAsync(productData);
		setShowCreateForm(false);
	};

	const canCreateProducts = hasPermission(user?.role, 'OPERATOR');

	return (
		<div className="container mx-auto p-6">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-3xl font-bold">Products</h1>

				{canCreateProducts && (
					<Button onClick={() => setShowCreateForm(true)}>
						<ShoppingBag className="mr-2 size-4" />
						Add Product
					</Button>
				)}
			</div>

			{error && (
				<div className="bg-destructive/10 text-destructive mb-4 rounded-md p-3">
					<span>{String(error)}</span>
				</div>
			)}

			{loading ? (
				<div className="flex justify-center">
					<div className="border-primary size-8 animate-spin rounded-full border-4 border-t-transparent" />
				</div>
			) : (
				<ProductList products={products} />
			)}

			{showCreateForm && (
				<ProductForm
					onSubmit={handleCreateProduct}
					onCancel={() => setShowCreateForm(false)}
				/>
			)}
		</div>
	);
}
```

### 5. Add Route

```typescript
// frontend/src/App.tsx
import { ProductsPage } from './pages/products/ProductsPage';

// Add to your routes
<Route
	path="/products"
	element={
		<ProtectedRoute roles={['VIEWER', 'OPERATOR', 'MANAGER', 'ADMIN', 'SYSOP']}>
			<ProductsPage />
		</ProtectedRoute>
	}
/>;
```

### 6. Update Navigation

```typescript
// frontend/src/components/layout/Sidebar.tsx
import { ShoppingBag } from 'lucide-react';

const navItems: NavItem[] = [
	// ... existing items
	{ icon: <ShoppingBag className="size-5" />, label: 'Products', to: '/products' },
];
```

---

## Styling Customization

### shadcn/ui + Tailwind CSS v4 Theme Customization

Spernakit v3 uses **shadcn/ui** (Radix UI primitives) with **Tailwind CSS v4**. Tailwind v4 uses CSS-based configuration rather than a `tailwind.config.js` file.

Theme customization is done via CSS custom properties in `frontend/src/tailwind.css`:

```css
/* frontend/src/tailwind.css */
@import 'tailwindcss';
@import 'tw-animate-css';

@custom-variant dark (&:is(.dark *));

@theme inline {
	--radius-sm: calc(var(--radius) - 4px);
	--radius-md: calc(var(--radius) - 2px);
	--radius-lg: var(--radius);
	/* ... additional radius tokens */
	--color-primary: var(--primary);
	--color-primary-foreground: var(--primary-foreground);
	--color-secondary: var(--secondary);
	--color-secondary-foreground: var(--secondary-foreground);
	--color-accent: var(--accent);
	--color-accent-foreground: var(--accent-foreground);
	--color-destructive: var(--destructive);
	--color-background: var(--background);
	--color-foreground: var(--foreground);
	--color-muted: var(--muted);
	--color-muted-foreground: var(--muted-foreground);
	--color-card: var(--card);
	--color-card-foreground: var(--card-foreground);
	--color-border: var(--border);
	--color-input: var(--input);
	--color-ring: var(--ring);
}

:root {
	--radius: 0.625rem;
	--background: oklch(1 0 0);
	--foreground: oklch(0.145 0 0);
	--primary: oklch(0.205 0 0); /* Customize this */
	--primary-foreground: oklch(0.985 0 0);
	--secondary: oklch(0.97 0 0);
	--secondary-foreground: oklch(0.205 0 0);
	--accent: oklch(0.97 0 0);
	--accent-foreground: oklch(0.205 0 0);
	--destructive: oklch(0.577 0.245 27.325);
	--border: oklch(0.922 0 0);
	--input: oklch(0.922 0 0);
	--ring: oklch(0.708 0 0);
	/* ... chart and sidebar tokens */
}

.dark {
	--background: oklch(0.145 0 0);
	--foreground: oklch(0.985 0 0);
	--primary: oklch(0.922 0 0); /* Customize this */
	--primary-foreground: oklch(0.205 0 0);
	/* ... override all tokens for dark mode */
}
```

To customize your theme, update the CSS custom properties in `:root` (light mode) and `.dark` (dark mode). Use [oklch.com](https://oklch.com/) to generate color values in OKLCH format.

#### Dark mode (Tailwind v4 + shadcn/ui)

- Use a `.dark` class on `document.documentElement` to toggle dark mode; Tailwind v4's `@custom-variant dark` maps to this class.
- Initialize theme before paint in `frontend/index.html` and reinforce on bootstrap in `frontend/src/main.tsx`.
- The theme is managed by the `useTheme` hook and persisted to `localStorage` to avoid flicker across reloads.

### Custom CSS

```css
/* frontend/src/tailwind.css - append custom layers */
@layer components {
	.btn-custom {
		@apply rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-2 font-bold text-white transition-all duration-200 hover:from-blue-600 hover:to-purple-700;
	}

	.card-custom {
		@apply border-border bg-card rounded-lg border p-6 shadow-lg transition-shadow duration-200 hover:shadow-xl;
	}
}
```

---

## Configuration Management

### Adding New Settings

1. **Update Settings Service**

    ```typescript
    // backend/src/services/settingsService.ts
    import { getDb } from '../db/index.ts';
    import { settings } from '../db/schema/settings.ts';
    import { getConfig } from '../config/configLoader.ts';

    // Runtime settings are stored in the settings table.
    // Static configuration comes from config/{appname}.json:
    const config = getConfig();
    const appName = config.app.name;

    // Example: seeding default settings
    function seedProductSettings() {
    	const defaults = {
    		defaultCategory: 'General',
    		maxPriceLimit: 10000,
    		requireApproval: false,
    	};
    	update('product_settings', JSON.stringify(defaults), 1, 'Default product settings');
    }
    ```

2. **Frontend Settings Hook**

    ```typescript
    // frontend/src/hooks/useSettings.ts
    export const useSettings = () => {
    	const { data: settings } = useQuery({
    		queryKey: ['settings'],
    		queryFn: () => settingsApi.getSettings(),
    	});

    	return {
    		appSettings: settings?.application_config || {},
    		productSettings: settings?.product_settings || {},
    	};
    };
    ```

### Environment-Specific Configuration

Environment-specific settings are managed through the JSON config file (`config/{appname}.json`):

```json
{
	"app": {
		"apiTimeout": 10000,
		"debug": true
	}
}
```

For production, update the values accordingly:

```json
{
	"app": {
		"apiTimeout": 5000,
		"debug": false
	}
}
```

---

## Customizing User Profiles

### Adding New Profile Tabs

1. **Create Tab Component**

    ```typescript
    // frontend/src/pages/Profile.tsx
    import { User, Settings, KeyRound, Bell, Puzzle } from 'lucide-react';

    // Add new tab to tabs array
    const tabs = [
      { icon: User, id: 'personal', name: 'Personal Info' },
      { icon: Settings, id: 'preferences', name: 'Preferences' },
      { icon: KeyRound, id: 'security', name: 'Security' },
      { icon: Bell, id: 'notifications', name: 'Notifications' },
      { icon: Puzzle, id: 'custom', name: 'Custom Settings' }, // New tab
    ];

    // Add tab content
    {activeTab === 'custom' && (
      <CustomProfileSettings
        onUpdateSetting={handleUpdateSetting}
        isLoading={updateUserSettingMutation.isPending}
      />
    )}
    ```

2. **Create Custom Settings Component**

    ```typescript
    // Custom Profile Settings Component
    import { Button } from '@/components/ui/button';

    interface CustomProfileSettingsProps {
      onUpdateSetting: (key: string, category: string, value: Record<string, unknown>) => void;
      isLoading: boolean;
    }

    function CustomProfileSettings({ onUpdateSetting, isLoading }: CustomProfileSettingsProps) {
      const [customSettings, setCustomSettings] = useState({
        customField1: '',
        customField2: false,
        customField3: 'option1',
      });

      const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onUpdateSetting('custom', 'user', customSettings);
      };

      return (
        <div className="bg-card rounded-lg border p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Custom Settings</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Custom form fields */}
            <div className="flex justify-end">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving...' : 'Save Custom Settings'}
              </Button>
            </div>
          </form>
        </div>
      );
    }
    ```

### Extending User Preferences

1. **Update UserSettings Interface**

    ```typescript
    // frontend/src/hooks/useUserSettings.ts
    interface UserSettings {
    	theme: 'system' | 'light' | 'dark';
    	layout: 'centered' | 'full-width';
    	appTheme: 'spernakit' | 'ocean' | 'forest' | 'sunset';
    	language: string;
    	timezone: string;
    	dateFormat: string;
    	timeFormat: string;
    	itemsPerPage: number;
    	// Add custom preferences
    	customPreference1: string;
    	customPreference2: boolean;
    	customPreference3: number;
    }

    const defaultUserSettings: UserSettings = {
    	// ... existing defaults
    	customPreference1: 'default',
    	customPreference2: false,
    	customPreference3: 10,
    };
    ```

2. **Add Custom Theme Handling**

    ```typescript
    // Add custom theme application logic
    useEffect(() => {
    	if (userSettings.customPreference1 === 'special') {
    		document.documentElement.classList.add('special-mode');
    	} else {
    		document.documentElement.classList.remove('special-mode');
    	}
    }, [userSettings.customPreference1]);
    ```

### Adding Profile Validation

1. **Backend Validation**

    ```typescript
    // backend/src/routes/users.ts - inline Elysia schema validation
    .put(
    	'/me/settings/custom',
    	({ body, set, user }) => {
    		if (!user) {
    			set.status = 401;
    			return { error: 'Unauthorized' };
    		}
    		// Handle custom settings update
    		return { success: true };
    	},
    	{
    		body: t.Object({
    			customField1: t.String({ maxLength: 100, minLength: 1 }),
    			customField2: t.Boolean(),
    			customField3: t.Union([
    				t.Literal('option1'),
    				t.Literal('option2'),
    				t.Literal('option3'),
    			]),
    		}),
    	}
    )
    ```

2. **Frontend Validation**

    ```typescript
    // Add validation to form component
    const validateCustomSettings = (settings: CustomSettings) => {
    	const errors: string[] = [];

    	if (!settings.customField1 || settings.customField1.length < 1) {
    		errors.push('Custom field 1 is required');
    	}

    	if (settings.customField1.length > 100) {
    		errors.push('Custom field 1 must be less than 100 characters');
    	}

    	return errors;
    };
    ```

### Custom Navigation Menu Items

1. **Extend Navigation**

    ```typescript
    // frontend/src/components/layout/Sidebar.tsx
    import { LayoutDashboard, Bell, Settings, User, FileText } from 'lucide-react';

    const navItems: NavItem[] = [
      { icon: <LayoutDashboard className="size-5" />, label: 'Dashboard', to: '/dashboard' },
      { icon: <FileText className="size-5" />, label: 'Custom Page', to: '/custom-page' },
      { icon: <Bell className="size-5" />, label: 'Notifications', to: '/notifications' },
      { icon: <Settings className="size-5" />, label: 'Settings', to: '/settings' },
      { icon: <User className="size-5" />, label: 'Profile', to: '/profile' },
    ];
    ```

2. **Add Custom Route**

    ```typescript
    // frontend/src/App.tsx
    <Route path="/custom-page" element={wrapRoute(<CustomPage />, undefined, true)} />
    ```

### Profile Data Persistence

1. **Custom Settings Storage**

    ```typescript
    // backend/src/services/settingsService.ts
    import { eq } from 'drizzle-orm';

    import { getDb } from '../db/index.ts';
    import { settings } from '../db/schema/settings.ts';

    function validateCustomSettings(value: unknown): boolean {
    	if (!value || typeof value !== 'object') return false;
    	const obj = value as Record<string, unknown>;
    	if (typeof obj.customField1 !== 'string') return false;
    	if (typeof obj.customField2 !== 'boolean') return false;
    	if (!['option1', 'option2', 'option3'].includes(obj.customField3 as string)) return false;
    	return true;
    }
    ```

2. **Schema Change (if needed)**

    If you need to add columns to an existing table, update the schema file and create a migration:

    ```bash
    # After updating the schema .ts file
    bun run db:generate
    bun run db:migrate
    ```

---

## Verifying Your Customizations

Spernakit does not use template-level unit test frameworks. Verify customizations with the repository quality gate and crawler-based checks instead.

### Required Verification

```bash
# Repository quality gate
bun run smoke:qc

# Verify the specific page or feature you changed
bun scripts/crawltest.ts --page /products

# Or verify a route family if the feature spans multiple pages
bun scripts/crawltest.ts --start-from /products
```

### Recommended Verification Flow

1. Run `bun run smoke:qc` after backend, frontend, schema, or config changes.
2. Run `bun scripts/crawltest.ts --page <route>` for focused UI verification on the affected page.
3. Run `bun scripts/crawltest.ts --start-from <route-prefix>` when a feature touches multiple related pages.
4. Run `bun run supertest` before release or template propagation work when you need the full reset + docker + screenshot pipeline.

### Example: Verifying a New Products Feature

```bash
# Confirm the repository still passes the quality gate
bun run smoke:qc

# Verify the products page renders and interacts correctly
bun scripts/crawltest.ts --page /products

# If the feature adds nested settings or detail routes, verify the route family
bun scripts/crawltest.ts --start-from /products
```

---

**Need more customization help?** Check the other documentation files or create an issue in the repository.

## Frontend Architecture Components

### Layout Components

The template provides a modular layout system in `frontend/src/components/layout/`:

| Component          | Purpose                            |
| ------------------ | ---------------------------------- |
| `AppShell`         | Root layout shell                  |
| `TopBar`           | Top navigation bar                 |
| `Sidebar`          | Main navigation sidebar            |
| `Header`           | Page header                        |
| `MobileNav`        | Responsive mobile navigation       |
| `CommandPalette`   | Command palette (Cmd+K)            |
| `ShortcutsHelp`    | Keyboard shortcuts help overlay    |
| `BugReportButton`  | Bug report button                  |
| `NotificationBell` | Notification indicator             |
| `UserMenu`         | User menu dropdown                 |
| `TabLayout`        | Tab-based page layout              |
| `SkipLink`         | Accessibility skip-to-content link |
| `navConfig`        | Navigation items configuration     |

### Navigation Configuration

Nav items are configured directly in `Sidebar.tsx` for easy extension:

```typescript
// frontend/src/components/layout/Sidebar.tsx
import { Folder } from 'lucide-react';

// Add to the navItems array:
const navItems: NavItem[] = [
	// ... existing items
	{ icon: <Folder className="size-5" />, label: 'Projects', to: '/projects' },
];
```

### Utility Hooks

| Hook                    | Purpose                                       |
| ----------------------- | --------------------------------------------- |
| `useAuth`               | Authentication state and methods              |
| `useAuthorization`      | Role and permission checks                    |
| `useContainerWidth`     | Responsive container width via ResizeObserver |
| `useKeyboardShortcuts`  | Keyboard shortcut registration                |
| `useNotificationSocket` | WebSocket notifications                       |
| `useTheme`              | Theme management (light/dark/system)          |
| `useWebSocket`          | WebSocket connection management               |
| `useWorkspace`          | Workspace context and selection               |
| `usePagination`         | Pagination state management                   |
| `useUnsavedChanges`     | Unsaved changes detection and prompting       |
| `useFormatters`         | Date, number, and text formatters             |
| `useAppFeatures`        | Application feature flags and capabilities    |
| `useSyncUiSettings`     | Sync UI settings with backend                 |
| `useUserSettings`       | User preferences                              |

### Command Palette

The `CommandPalette` component in `frontend/src/components/layout/` provides application-wide search and quick actions, accessible via Cmd+K (or Ctrl+K on Windows/Linux).

### Routing Architecture

Routes are organized into authenticated and unauthenticated groups in `App.tsx`. The `wrapRoute` helper simplifies protected route creation:

```typescript
<Route path="/admin" element={wrapRoute(<AdminPage />, 'ADMIN')} />
<Route path="/dashboard" element={wrapRoute(<Dashboard />)} />
```
