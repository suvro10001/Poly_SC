# Repository guide

## Build and run

- `npm ci` installs dependencies from the lockfile.
- `npm run dev` starts `server.ts`, which runs the Express API alongside Vite for development.
- `npm run build` builds the Vite frontend and bundles the server to `dist/server.cjs`.
- `npm start` runs the built server.
- `npm run lint` runs `tsc --noEmit` using the repository TypeScript configuration.

## Architecture

This is a React 19, TypeScript, and Vite inventory and sales-center application with an Express server. The browser entry point is `src/main.tsx`; `src/App.tsx` coordinates the application shell, role-aware navigation, and shared ERP state. Most feature screens are in `src/components/` and are loaded lazily through the loader map in `src/utils/viewPreloader.ts`. Add or update that map when introducing a screen that should follow the existing lazy-loading pattern.

The Express server is `server.ts`. It hosts API routes and initializes the multi-device sync hub in `src/serverSync.ts`. The hub persists shared state under `data/` and broadcasts updates to connected browsers; the browser also integrates Firestore and other cloud-sync/failover paths. Changes to persisted ERP state may therefore involve local browser storage, cloud sync, and server sync—trace the relevant state flow before changing persistence behavior.

`src/types.ts` contains the main ERP entity types; `src/types/` contains additional domain models. `src/utils/` holds shared business rules and integrations, including branch access, stock, price history, imports/exports, and sync. Prefer these domain helpers over reimplementing business logic in a screen component. The separate `src/context/ChallanContext.tsx` manages challans, invoices, and catalog state.

## Repository conventions

- The Vite and TypeScript `@/` alias points to the repository root.
- Keep role and branch permission checks consistent with `src/utils/branchAccess.ts`; screens should not invent their own access rules.
- Follow the lazy screen registration pattern in `src/utils/viewPreloader.ts` for feature screens.
- ERP data types and calculations are shared across screens and sync paths. Check existing types and helpers before changing record shapes or calculations.
- Environment configuration is documented in `.env.example`; use environment variables for service configuration rather than adding credentials to source.
