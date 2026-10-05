# Monorepo Guide — v1

> Version: `8df10ed` — `chore: basic mono-repo setup v1`
> Date: Mon Oct 5 17:29:22 2026 +0530
> Remote: `https://github.com/PallabDev/Monorepo-Setup.git` (`master`)
> Package manager: `pnpm@11.0.9` (`devEngines.packageManager.onFail: download`)
> Stack: Next.js `16.3.8` + React `19.2.8` + Tailwind `4` (`apps/web`), Express `5.2.1` + `tsx` + `tsc` (`apps/api`), `zod` shared (`packages/utils`)

Verify version anytime:

```powershell
git log --oneline -5 --decorate
git show --stat HEAD
git ls-files | Sort-Object
```

`HEAD` contains 26 files, ~6012 insertions (mostly `pnpm-lock.yaml`).

---

## 1. What is a monorepo?

One Git repo, many packages. Shared tooling + atomic commits, but each app still builds/deploys independently.

```
minurl/                  # git root == pnpm root (must match, see §6)
  package.json           # private:true, root scripts only
  pnpm-workspace.yaml    # defines members: apps/*, packages/*
  pnpm-lock.yaml         # single lockfile for all members
  .gitignore
  apps/                  # fully deployable code
    web/                 # Next.js frontend -> Vercel / Node
    api/                 # Express backend -> Node / Docker
  packages/              # shared, non-deployable code
    utils/               # zod schemas, types, helpers
```

Polyrepo alternative = 3 separate repos, 3 lockfiles, version drift. Monorepo = 1 install, `workspace:*` links, one PR touches `web + api + utils` together.

---

## 2. `apps/` — fully deployable code

Rule: everything in `apps/*` has its own `package.json` with `dev / build / start`, can be deployed alone.

| App | Name | Dev | Build | Start | Deploy target |
|---|---|---|---|---|---|
| `apps/web` | `web`, `private:true` | `next dev` (:3000) | `next build` | `next start` | Vercel / any Node host |
| `apps/api` | `@minurl/api`, `private:true`, `main: ./dist/index.js` | `tsx watch src/index.ts` (:5000) | `tsc` (`src/` -> `dist/`) | `node dist/index.js` | Render / Fly / Docker |

Each app has its own `tsconfig.json`, `node_modules/` (pnpm symlinks), and ignores (`dist/`, `.next/`, `out/`). You **must** go into the individual folder to build/run it, or use a root filter — there is no single merged build.

```powershell
# per-app (explicit, preferred for logs)
pnpm --filter web dev
pnpm --filter @minurl/api dev

# root shortcuts (defined in root package.json)
pnpm dev    # = pnpm -r --parallel dev  -> runs every member's dev
pnpm build  # = pnpm -r build
```

---

## 3. `packages/` — shared code

Rule: `packages/*` is **never** deployed directly. It is imported by `apps/*` via `workspace:*`.

Current v1 member:

`packages/utils` — `name: @minurl/utils`, `private:true`

- `src/index.ts`: single source of truth for validation:
  ```ts
  import { z } from "zod"
  export const createUserSchema = z.object({
    name: z.string().min(3, "Name must be at least 3 characters long"),
    email: z.email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters long"),
  })
  export type CreateUserSchemaType = z.infer<typeof createUserSchema>
  ```
- `package.json`: `exports: { ".": "./src/index.ts" }`, `deps: zod`, `scripts: dev: tsc --watch / build: tsc`
- `tsconfig.json`: `rootDir: ./src`, `outDir: ./dist`, `strict:true`, `module: nodenext`, `target: esnext`

Consumers declare it as:

```json
"@minurl/utils": "workspace:*"
```

pnpm then symlinks `apps/web/node_modules/@minurl -> ../../...` and `apps/api/node_modules/@minurl -> ...`. No publish, no version bump needed in v1.

Used in both sides in v1:

- `apps/api/src/index.ts`: `createUserSchema.safeParse(req.body)` -> `400 { success:false, messages }` or `200 { success:true }`
- `apps/web/src/app/page.tsx`: `createUserSchema.safeParse({name,email,password})` client-side before `axios.post("http://localhost:5000/users", result.data)`

---

## 4. Step-by-step — what v1 actually did, file by file

### Step 0 — Root scaffolding

`package.json` (root):
```json
{
  "name": "minurl",
  "private": true,
  "scripts": { "dev": "pnpm -r --parallel dev", "build": "pnpm -r build" },
  "devEngines": { "packageManager": { "name": "pnpm", "version": "^11.0.9" } }
}
```
`private:true` blocks accidental `pnpm publish`. No deps here — only orchestration.

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
allowBuilds:
  esbuild: false
  unrs-resolver: false
```

`.gitignore` (root, 46 lines): `node_modules/`, `.pnp*`, `.pnpm-store/`, `dist/`, `build/`, `.next/`, `out/`, `coverage/`, `.env*` (`!.env.example`), `.vercel`, `*.tsbuildinfo`, `next-env.d.ts`, OS/editor. Covers all members, so `apps/web/.gitignore` (41 lines, default `create-next-app`) is now redundant but kept in v1.

### Step 1 — `packages/utils`

1. `packages/utils/package.json` — name, exports, `zod`, `typescript` devDep.
2. `packages/utils/src/index.ts` — `createUserSchema` + inferred type (see §3).
3. `packages/utils/tsconfig.json` — `rootDir/src`, `outDir/dist`, `strict`, `nodenext`, `declaration:true`, `skipLibCheck:true`.

No `dev/build` output committed (`dist/` ignored).

### Step 2 — `apps/api`

1. `apps/api/package.json` — `@minurl/api`, `express + cors`, `@types/* + tsx + typescript`, `workspace:*` dep on utils.
2. `apps/api/src/index.ts` — `express.json() + cors()`, `GET / -> Hello World!`, `POST /users` validates with shared schema, `listen(5000)`.
3. `apps/api/tsconfig.json` — same strict base as utils + `lib: [esnext]`, `types: [node]`, `rootDir/src`, `outDir/dist`.

Run: `cd apps/api; pnpm dev` (`tsx watch`), `pnpm build` (`tsc`), `pnpm start` (`node dist/index.js`).

### Step 3 — `apps/web`

Created via `create-next-app`, then wired to workspace:

1. `apps/web/package.json` — `next 16.3.8`, `react 19.2.8`, `axios`, `tailwindcss 4 + @tailwindcss/postcss`, `eslint-config-next`, `workspace:*` dep.
2. `next.config.ts` — empty `NextConfig` placeholder (no `turbopack.root` needed once git root = pnpm root).
3. `postcss.config.mjs` — `{ "@tailwindcss/postcss": {} }` (Tailwind v4 way, no `tailwind.config.js`).
4. `eslint.config.mjs` — default Next flat config.
5. `tsconfig.json` — `bundler` resolution, `jsx: react-jsx`, `paths: @/* -> src/*`, `plugins: [{name: next}]`, `noEmit:true`.
6. `src/app/globals.css` — `@import "tailwindcss"`, CSS vars `--background/--foreground`, `@theme inline` mapping to `bg-background/text-foreground`, dark-mode media query.
7. `src/app/layout.tsx` — `Geist` fonts, `metadata`, `html.h-full.antialiased > body.min-h-full.flex.flex-col`.
8. `src/app/page.tsx` — `"use client"` form: `useState(name/email/password/error/success)`, `safeParse` on submit, `axios.post(:5000/users)`, Tailwind theme tokens only (`bg-background`, `text-foreground`, `border-foreground/20`, `bg-foreground/text-background` button). No hardcoded palette.
9. `public/*.svg + favicon.ico`, `README.md` — default Next assets.

Run: `cd apps/web; pnpm dev` (:3000), `pnpm build`, `pnpm start`, `pnpm lint`.

### Step 4 — Lock + install

`pnpm install` from **root only** generates single `pnpm-lock.yaml` (5489 lines in v1) + root `node_modules/.pnpm/` virtual store + per-member symlinks. Never run `pnpm install` inside `apps/*` — it creates a divergent `virtualStoreDir` (`apps/web/node_modules/.modules.yaml`) and breaks Turbopack hermetic resolution.

---

## 5. Why you build per-folder / per-file

- Isolation: `web` uses `bundler` + `noEmit`, `api/utils` use `nodenext` + emit to `dist`. One root `tsc` cannot satisfy both.
- Deployability: `apps/api/dist/` and `apps/web/.next/` are independent artifacts. CI builds `pnpm --filter @minurl/api build` and `pnpm --filter web build` separately.
- Symlinks: `workspace:*` only resolves if each member has its own `package.json`. Root never imports them directly.

Mental model: root = router, `apps/*` = servers, `packages/*` = libs. Always `cd` into the unit you are changing, or use `--filter`.

---

## 6. Pitfall fixed in v1 — git root must equal pnpm root

Earlier error:

```
Warning: Next.js ignored pnpm-workspace.yaml ... outside current Git repository (apps/web)
Turbopack build ... Could not find next/package.json ... Filesystem root: apps/web
```

Cause was nested `apps/web/.git` while root had no `.git`, so Turbopack locked FS root to `apps/web` and refused symlink `apps/web/node_modules/next -> ../../node_modules/.pnpm/next@...` (outside root).

Fix applied before v1 commit: single `D:/Personal Project/minurl/.git`, no nested `.git`. Verify with `git rev-parse --show-toplevel` from both root and `apps/web` — both must print `D:/Personal Project/minurl`. If you ever need an exception, set `turbopack.root` in `next.config.ts`, but don't — keep roots aligned.

---

## 7. Reproduce / verify v1

```powershell
pnpm install
pnpm --filter @minurl/utils build
pnpm --filter @minurl/api dev     # :5000, GET / -> Hello World!
pnpm --filter web dev             # :3000, submit form -> POST :5000/users
pnpm build                        # builds all members
git log --oneline -1              # 8df10ed chore: basic mono-repo setup v1
```
