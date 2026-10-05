# minurl — Turborepo + pnpm Monorepo Setup

> Single repo for Next.js frontend + Express backend + shared validation.
> Reproducible from empty folder. Windows PowerShell friendly.

Current state: `v1` committed as `8df10ed chore: basic mono-repo setup v1` + uncommitted Turbo update (`turbo.json`, root `turbo dev/build`, `.turbo` ignored). See `docs/monorepo-guide-v1.md` for v1-only snapshot.

```
minurl/
  package.json            # private, turbo dev/build only
  pnpm-workspace.yaml     # apps/*, packages/*
  turbo.json              # build ^build, outputs dist/** + .next/**
  pnpm-lock.yaml
  .gitignore
  apps/                   # fully deployable
    web/                  # Next 16.3.8 + React 19 + Tailwind 4 (:3000)
    api/                  # Express 5.2.1 + tsx + tsc (:5000)
  packages/
    utils/                # @minurl/utils — zod schemas, shared
  docs/
    monorepo-guide-v1.md
```

## 1. Concepts

**Monorepo:** one Git repo, many packages, one lockfile, atomic commits. Alternative (polyrepo) = drift.

**`apps/`:** fully deployable. Own `package.json` with `dev/build/start`, own `tsconfig`, own deploy target (`web` → Vercel, `api` → Node/Docker).

**`packages/`:** shared, never deployed alone. Imported via `workspace:*`, e.g. `"@minurl/utils": "workspace:*"`. pnpm symlinks it, no publish needed.

**Turborepo:** task runner. `turbo dev` / `turbo build` runs each member's script in dependency order (`^build` = build deps first), caches `dist/**` + `.next/**`. `dev` is `persistent:true, cache:false` (never cache a watcher).

**Rule:** Git root **must** equal pnpm root. One `.git` at `minurl/`, no nested `apps/web/.git`. Otherwise Next Turbopack ignores `../pnpm-workspace.yaml` and fails with `Could not find next/package.json` (symlink points outside its locked FS root).

## 2. Prerequisites

- Node LTS, `pnpm@11.0.9` (`corepack enable; corepack prepare pnpm@11.0.9 --activate`)
- No nested `.git` inside `apps/*`

## 3. Recreate from scratch

### Step 0 — Root

```powershell
mkdir minurl; cd minurl
git init
pnpm init
```

Edit `package.json` to:

```json
{
  "name": "minurl",
  "private": true,
  "scripts": { "dev": "turbo dev", "build": "turbo build" },
  "packageManager": "pnpm@11.0.9",
  "type": "module",
  "devDependencies": { "turbo": "^2.11.7" }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
allowBuilds:
  esbuild: false
  unrs-resolver: false
```

Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**", "!.next/cache/**"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

Create root `.gitignore` (covers all members):

```
node_modules/
.pnp / .pnp.* / .yarn/* / .pnpm-store/
npm-debug.log* / yarn-debug.log* / yarn-error.log* / .pnpm-debug.log* / pnpm-debug.log*
dist/ / build/
.next/ / out/ / next-env.d.ts / *.tsbuildinfo
coverage/ / .nyc_output/
.env* / !.env.example
.vercel
.DS_Store / *.pem / *.log / .vscode/* / .idea/
.turbo / .env
```

### Step 1 — `packages/utils` (shared first, apps depend on it)

```powershell
mkdir packages/utils/src -Force
cd packages/utils
pnpm init
pnpm add zod
pnpm add -D typescript
```

`packages/utils/package.json`:

```json
{
  "name": "@minurl/utils",
  "private": true,
  "main": "index.js",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "dev": "tsc --watch", "build": "tsc" },
  "type": "module",
  "dependencies": { "zod": "^4.6.5" },
  "devDependencies": { "typescript": "^7.0.2" }
}
```

`packages/utils/src/index.ts`:

```ts
import { z } from "zod"
export const createUserSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters long"),
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
})
export type CreateUserSchemaType = z.infer<typeof createUserSchema>
```

`packages/utils/tsconfig.json`: `rootDir: ./src`, `outDir: ./dist`, `module: nodenext`, `target: esnext`, `strict:true`, `declaration:true`, `skipLibCheck:true`.

### Step 2 — `apps/api` (Express)

```powershell
mkdir apps/api/src -Force
cd apps/api
pnpm init
pnpm add express cors @minurl/utils@workspace:*
pnpm add -D typescript tsx @types/express @types/cors @types/node
```

`apps/api/package.json`:

```json
{
  "name": "@minurl/api",
  "private": true,
  "main": "./dist/index.js",
  "scripts": { "dev": "tsx watch src/index.ts", "build": "tsc", "start": "node dist/index.js" },
  "type": "module"
}
```

`apps/api/src/index.ts`:

```ts
import express from "express"
import cors from "cors"
import { createUserSchema } from "@minurl/utils"

const app = express()
app.use(express.json())
app.use(cors())

app.get("/", (req, res) => res.send("Hello World!"))

app.post("/users", (req, res) => {
  const result = createUserSchema.safeParse(req.body)
  if (!result.success)
    return res.status(400).json({ success: false, messages: result.error.issues.map(i => i.message) })
  return res.json({ success: true, message: "User created successfully" })
})

app.listen(5000, () => console.log("Server is running on port 5000"))
```

`apps/api/tsconfig.json`: same base as utils + `lib: ["esnext"]`, `types: ["node"]`.

### Step 3 — `apps/web` (Next.js)

From `apps/`:

```powershell
pnpm create next-app@latest web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd web
pnpm add axios @minurl/utils@workspace:*
```

Keep defaults: `next.config.ts` empty `NextConfig`, `postcss.config.mjs` with `@tailwindcss/postcss`, `globals.css` with `@import "tailwindcss"` + `bg-background/text-foreground` theme tokens, `layout.tsx` with Geist fonts.

`src/app/page.tsx` (`"use client"`): `useState` form → `createUserSchema.safeParse()` → `axios.post("http://localhost:5000/users", result.data)`. Style with theme tokens only (`bg-background`, `border-foreground/20`, `bg-foreground/text-background` button) so light/dark follows CSS vars.

### Step 4 — Install + run (always from root)

```powershell
cd minurl
pnpm install          # single pnpm-lock.yaml, never install inside apps/*
pnpm dev              # turbo dev → web :3000 + api :5000 + utils watch
pnpm build            # turbo build (utils first via ^build)
```

Per-package when needed:

```powershell
pnpm --filter web dev
pnpm --filter @minurl/api dev
pnpm --filter @minurl/utils build
turbo build --filter=web
```

Verify: `GET http://localhost:5000/` → `Hello World!`, submit web form → `POST :5000/users` → `{ success:true }`.

## 4. Scripts reference

| Where | Command | What |
|---|---|---|
| root | `pnpm dev` | `turbo dev` (all watchers, persistent) |
| root | `pnpm build` | `turbo build` (topological, cached) |
| `utils` | `tsc --watch` / `tsc` | typecheck / emit `dist/` |
| `api` | `tsx watch` / `tsc` / `node dist/index.js` | dev / build / start |
| `web` | `next dev/build/start`, `eslint` | dev :3000 / prod build / lint |

## 5. Deploy

- `web`: Vercel, root `apps/web`, build `pnpm --filter web build`
- `api`: Node/Docker, build `pnpm --filter @minurl/api build`, run `node apps/api/dist/index.js`
- `utils`: never deployed, bundled via workspace link

## 6. Troubleshooting

- `ignored pnpm-workspace.yaml ... outside Git repo` → delete nested `apps/web/.git`, keep one `.git` at root.
- `Could not find next/package.json` → you installed inside `apps/web` (wrong `virtualStoreDir`). Delete `apps/*/node_modules`, `pnpm install` from root.
- Turbo runs old output → `pnpm build --force`, or delete `.turbo`, `dist/`, `.next/`.
