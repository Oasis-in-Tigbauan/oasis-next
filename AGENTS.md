# Oasis-Next — Agent Instructions

**Oasis-Next** is a per-municipality management system for the Municipality of Tigbauan. It handles OBR (Obligation Request) workflows, user management, role-based access, and administrative operations. It is a **Next.js App Router** application using Drizzle ORM, better-auth, Redis, and shadcn/ui.

---

## Commands

```bash
pnpm run dev           # Start dev server (http://localhost:3000)
pnpm run build         # Production build
pnpm run lint          # ESLint
pnpm exec tsc --noEmit # Type-check without emitting output
pnpm run db:generate   # Generate migration file from schema changes
pnpm run db:migrate    # Run migrations (prod)
pnpm run db:studio     # Open Drizzle Studio
pnpm run setup         # Interactive first-time setup (generates .env + starts Docker)
pnpm run setup:admin   # Generate setup token for first admin account
```

> Use `pnpm` as the only package manager for this repository. On Windows PowerShell, use `pnpm.cmd` instead of `pnpm` to avoid execution policy errors.

---

## Architecture

### Route Groups

| Group | Purpose |
|---|---|
| `app/(anonymous_only)/` | Unauthenticated users only — auth, enrollment |
| `app/(user_required)/` | Authenticated users only |
| `app/(user_required)/(verified_only)/` | Email-verified, active users |
| `app/(user_required)/(unverified_allowed)/` | Logged in but unverified |
| `app/(user_required)/(banned_only)/` | Banned users |
| `app/api/` | API routes: `auth/`, `enrollment/`, `management/`, `obr/` |

Each layout performs its own auth check via `session.verify()` and redirects on failure.

### Key Directories

| Path | Purpose |
|---|---|
| `lib/db/` | Drizzle schema, DB client, permissions |
| `lib/auth.ts` | better-auth config, `session.verify()` |
| `lib/accounts/` | User/account queries, Redis caching |
| `lib/one-of/` | Result/Either pattern (`Success` / `Failure`) |
| `lib/validators/` | Custom `Validator` class + Zod schemas |
| `lib/cache/` | Redis wrapper (`cacheManager`) |
| `lib/http/` | API response builder, fetch utilities |
| `lib/mailer/` | Resend email templates |
| `components/ui/` | shadcn/Radix components |

---

## Conventions

### Naming
- Files: `kebab-case.tsx`
- Components: `PascalCase`
- Functions/variables: `camelCase`
- Permissions/constants: `UPPER_SNAKE_CASE`

### Package Management
- Use `pnpm` as the primary and only package manager for this repository
- Do not use `npm`, `yarn`, or `bun` commands, lockfiles, or install flows
- When documenting or suggesting commands, always prefer `pnpm` equivalents

### Database (Drizzle + PostgreSQL)
- Schema lives in `lib/db/schema.ts`
- All IDs are UUID v7
- Monetary amounts are represented as strings in types/payloads and must be converted via Decimal helpers before arithmetic
- Permissions stored as `text[]` on the `office_position` table — no join table
- For schema changes, always run: `db:generate` → `db:migrate` (never `db:push`)

### Authentication (better-auth)
- Session is verified via `session.verify(permissions?, mode?)` from `lib/auth.ts`
- Returns a `SessionVerifiedResult` with `code: SessionCode` — always check the code before accessing `session`/`user`
- Shadow-ban column is intentionally named `DO_NOT_DELETE_THIS_OR_ELSE_YOU_ARE_FIRED`
- Email verification is **not** sent by email — admins set `emailVerified: true` via Drizzle Studio or invitation flow

### Result / Error Pattern (`lib/one-of/`)
All server-side functions return `Success<T> | Failure`. Never throw directly.

```typescript
// Creating results
return new Success(data)
return new Failure(ErrorCodes.ValidationFailure, "message")

// Consuming results
const result = await someServiceFn()
oneOf(result).match(
  (data) => { /* success */ },
  (err) => { /* err.type, err.message */ }
)
// Or if failure should throw:
const data = await unwrap(someServiceFn())
```

`Failure` auto-captures to Sentry — do not call `captureException` separately.

### Validation (`lib/validators/`)
Use the custom `Validator` class, not raw Zod directly.

```typescript
await validator.validate(input, {
  properties: { email: { type: "string", formatter: "email" } },
  requiredProperties: ["email"],
  allowUnvalidatedProperties: false,
})
```

Built-in formats: `non-empty-string`, `email`, `uuid`, `valid-number`, `strong-password`, `decimal`

Use the `decimal` formatter for API input validation when receiving financial values as strings.

### JSDoc Style
- Follow the service-layer JSDoc style already used in [lib/obr/index.ts](lib/obr/index.ts) and [lib/esre/index.ts](lib/esre/index.ts)
- Prefer a full block for exported service functions: one-line summary, blank line, `@description`, success/failure behavior notes, `@async`, `@function`, `@param`, `@returns`, and `@remarks` when useful
- Document result-wrapper behavior explicitly, especially when returning `Success<T> | Failure`
- Keep descriptions concrete and behavior-focused; explain validation, side effects, batching, and mapping behavior instead of repeating type names

### Permissions
- Permissions are checked via `permissionMap.has(permission)` in client components
- In server components / API routes use `session.verify([PERMISSION], "and" | "or")`
- Permission constants are defined in `lib/db/` — follow `DOMAIN_ENTITY_ACTION` pattern (e.g., `OBR_REQUEST_CREATE`)

### Components
- UI components should default to **Client Components**
- Server Components are only used for layout components that check permissions before allowing page access
- Place business logic in `lib/[domain]/index.ts`, not in components
- Add new UI primitives under `components/ui/` following the existing shadcn pattern

### API Boundary
- Frontend must not call services directly
- All frontend-to-backend data access goes through API routes first
- Server functions are only allowed for authentication-related flows (e.g., `session.verify`, which can call account libraries directly)

### Financial Data Types
- Financial values are represented as `string` in types and payloads
- Convert using `casts.castFromDecimal` before arithmetic operations
- Never use `number` for fields that represent financial values

### Timezone Display Rules
- Time-related values received from API responses should be treated as source timestamps and converted on the frontend when displayed to users
- Display timezone-sensitive date/time values in UTC+8 (Taipei Standard Time)
- Keep raw API values unchanged; only transform for presentation at the UI boundary
- Centralize formatting through shared frontend date/time utilities instead of ad-hoc conversions in components

### Required Validation Commands
- Always run `pnpm run lint` for linting
- Always run `pnpm exec tsc --noEmit` for type checking
- Prefer these commands as the default post-change validation unless a narrower task-specific check exists

---

## Environment Variables

Generated by `pnpm run setup`. Key variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `BETTER_AUTH_URL` | Auth base path (e.g. `http://localhost:3000`) |
| `BETTER_AUTH_SECRET` | Session signing secret |
| `RESEND_API_KEY` | Email service token |
| `RESEND_FROM_ADDRESS` | Sender address |
| `SENTRY_AUTH_TOKEN` | Sentry token |
| `NEXT_PUBLIC_PROJECT_ORG_NAME` | Org name (public, client-visible) |

---

## Common Pitfalls

- **Decimal amounts**: Financial values are strings; use Decimal conversion helpers before calculations
- **Financial typing**: Do not use `number` for money-related fields in schemas, types, DTOs, or API contracts
- **Timezone rendering**: Do not display raw API timestamps directly when user-facing output should be localized; convert to UTC+8 for display
- **Result unwrapping**: Server functions return `Success | Failure`; forgetting to unwrap causes type errors
- **Shadow-ban column**: The `DO_NOT_DELETE_THIS_OR_ELSE_YOU_ARE_FIRED` field is real and must not be renamed/removed
- **First admin setup**: Must manually set `emailVerified: true` in Drizzle Studio — email verification is not automated
- **Per-municipality**: No multi-tenant logic exists — do not add cross-org queries
