# Seerr — Book Support Feature

## What is Seerr?

Seerr is a fork of Overseerr — a media request management tool that integrates with Plex, Jellyfin, Radarr, and Sonarr. Users search for movies and TV shows, request them, and approved requests are automatically fulfilled via Radarr/Sonarr.

## What We're Building

We are adding **book support** as a third media type alongside movies and TV shows. The full specification lives in [`docs/book-support-spec.md`](docs/book-support-spec.md).

### Core Tenet

**Book support must not degrade the existing movies/TV experience.** Movies and TV shows are the primary use case. Every design decision must preserve current behavior as the default. Book search is opt-in. No Open Library API calls are made unless the user has explicitly switched to book search mode.

### Architecture Summary

- **Metadata Provider:** Open Library (primary, free, no API key) + Google Books (fallback for covers/descriptions)
- **Fulfillment Backend:** Bookshelf (Servarr-compatible fork of Readarr) — uses the same API as Radarr/Sonarr, so we extend `ServarrBase`
- **ID Bridge:** Open Library OLIDs → ISBN-13 → Bookshelf foreign IDs (with title+author fallback)
- **Search:** `type=book` query parameter on existing search endpoint; default (no param) is Movies/TV only
- **Permissions:** `REQUEST_BOOK` (bit 29) and `AUTO_APPROVE_BOOK` (bit 30)

### Implementation Phases

1. **Phase 1 — Foundation:** MediaType enum, DB migration, Open Library API client, permissions, settings types
2. **Phase 2 — API Routes:** Book/author detail routes, search `type=book`, Bookshelf settings CRUD, request handling
3. **Phase 3 — Bookshelf Integration:** BookshelfAPI client, request→Bookshelf fulfillment, availability sync
4. **Phase 4 — Frontend:** Book/author detail pages, search filter toggle, request modal, Bookshelf settings UI
5. **Phase 5 — Polish:** Notifications, i18n, tests, API docs, placeholder images

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (Pages Router), React 18, Tailwind CSS, SWR, Formik, React Intl |
| Backend | Express 4, TypeScript 5.4 |
| Database | TypeORM 0.3 with SQLite (default) or PostgreSQL |
| Testing | `node:test` + supertest (unit/integration), Cypress 14 (E2E) |
| Build | pnpm 10, husky + lint-staged, ESLint (flat config), Prettier |
| CI/CD | GitHub Actions, Docker |

## Key Commands

```bash
pnpm dev              # Start development server
pnpm build            # Full build (Next.js + server)
pnpm test             # Run unit/integration tests
pnpm lint             # Check code quality
pnpm lintfix          # Auto-fix lint issues
pnpm format           # Format code with Prettier
pnpm typecheck        # TypeScript type checking
pnpm i18n:extract     # Extract i18n strings
pnpm cypress:open     # Open Cypress E2E runner
```

## Project Structure

```
server/
  api/                  # External API clients (extend ExternalAPI or ServarrBase)
    openlibrary/        # [NEW] Open Library API client
    servarr/            # Radarr, Sonarr, [NEW] Bookshelf (extend ServarrBase)
    themoviedb/         # TMDb API client
    externalapi.ts      # Base class: caching, rate limiting, axios
  entity/               # TypeORM entities (Media, MediaRequest, User, etc.)
  routes/               # Express route handlers
    settings/           # Settings CRUD routes (radarr, sonarr, [NEW] bookshelf)
    book.ts             # [NEW] Book detail routes
    author.ts           # [NEW] Author detail routes
    search.ts           # Search route (extend with type=book)
    request.ts          # Request route (extend with MediaType.BOOK)
  models/               # Response model mappers
  lib/
    settings/           # Settings system (JSON file, migrations)
    permissions.ts      # Permission enum (bitmask)
    availabilitySync.ts # Library sync (extend for Bookshelf)
  migration/            # DB migrations (sqlite/ and postgres/ subdirs)
  constants/            # Enums (MediaType, MediaStatus)

src/
  pages/                # Next.js pages
    book/[bookId].tsx   # [NEW] Book detail page
    author/[authorId].tsx # [NEW] Author detail page
    search.tsx          # Search page (extend with book filter)
  components/
    BookDetails/        # [NEW] Book detail component
    AuthorDetails/      # [NEW] Author detail component
    Search/SearchFilter.tsx # [NEW] Movies/TV | Books toggle
    Settings/BookshelfModal/ # [NEW] Bookshelf settings modal
    TitleCard/          # Media card (extend with book type)
    Common/CachedImage/ # Image component (extend with OL proxy)
    RequestButton/      # Request button (extend with book format)
```

## Key Patterns

### External API Clients
All API clients extend `ExternalAPI` (in `server/api/externalapi.ts`). This provides axios-based HTTP, node-cache caching, rate limiting, and proxy support. Study `server/api/themoviedb/index.ts` as the reference implementation.

### Servarr Clients
Radarr and Sonarr extend `ServarrBase` (in `server/api/servarr/base.ts`). Bookshelf uses the identical Servarr v1 API, so `BookshelfAPI` should extend `ServarrBase` too. Study `server/api/servarr/radarr.ts` as the reference.

### Settings
Settings are stored in a JSON file managed by a singleton in `server/lib/settings/index.ts`. Bookshelf settings follow the `DVRSettings` interface pattern used by Radarr/Sonarr. Settings routes follow the CRUD pattern in `server/routes/settings/radarr.ts`.

### Entities
TypeORM entities use decorators. The `Media` entity stores external IDs and availability status. The `MediaRequest` entity handles the request lifecycle with permissions and quotas. New columns must be **nullable** to avoid breaking existing rows.

### Frontend Components
Components follow a directory-per-component pattern. Data fetching uses SWR. Forms use Formik + Yup. All strings use react-intl. Styling uses Tailwind CSS utility classes.

## Agents

Specialist agents are defined in `.claude/agents/`:

| Agent | Responsibility |
|---|---|
| `architect` | Lead architect and orchestrator — assesses project state, coordinates work across agents |
| `api-developer` | Express routes, API clients (Open Library, Bookshelf), response models, fulfillment logic |
| `database-developer` | TypeORM entities, migrations, settings interfaces, permissions |
| `frontend-developer` | Next.js pages, React components, Tailwind UI, SWR, i18n |
| `testing` | Unit/integration tests (node:test + supertest), fixtures |
| `e2e-testing` | Cypress E2E tests, fixtures, test database seeding |
| `devops` | CI/CD, Docker, build config, OpenAPI spec, code quality |

## Important Rules

1. **Read before edit.** Always read a file before modifying it. Use `Edit` for targeted changes, not `Write` for full rewrites.
2. **No regressions.** Movie/TV search, requests, and detail pages must work identically after book support is added.
3. **Spec is source of truth.** All implementation follows `docs/book-support-spec.md`.
4. **Nullable columns only.** New database columns for books must be nullable.
5. **Extend, don't fork.** Use existing base classes (`ExternalAPI`, `ServarrBase`, `DVRSettings`) rather than creating parallel systems.
6. **i18n everything.** All user-facing strings go through react-intl.
7. **Tests required.** Every new feature needs unit tests. E2E tests for user-facing flows.
