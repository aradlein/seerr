# Book Support for Seerr — Spec & Technical Architecture

## 1. Overview

This document specifies the design for adding **book support** to Seerr (formerly Overseerr). Books will become a third media type alongside movies and TV shows, following the same request/approval/fulfillment workflow. Users will be able to search for books, view details (cover art, author info, descriptions), request them, and have approved requests fulfilled automatically via a backend service.

### Core Tenet: Movies & TV First

**Book support must not degrade the existing movies/TV experience in any way.** Movies and TV shows are the primary use case. Every design decision — search, routing, performance, UI — must preserve the current behavior as the default. Concretely:

- Search defaults to Movies/TV. Book search is opt-in via an explicit filter toggle.
- No additional API calls (Open Library, Google Books) are made unless the user has switched to book search mode.
- Existing API endpoints, response shapes, and frontend behavior remain unchanged for `mediaType: 'movie'` and `mediaType: 'tv'`.
- No new database columns or migrations may alter the schema of existing movie/TV rows (all new columns are nullable and unused by movie/TV code paths).
- Performance of movie/TV search, detail pages, and request workflows must be unaffected.

---

## 2. External Service Choices

### 2.1 Metadata Provider: Open Library (Primary) + Google Books (Fallback)

**Primary — Open Library API** (openlibrary.org)
- Truly free, no API key required (identify via `User-Agent` header for 3x rate limit)
- ~20M editions, ~6M authors
- REST/JSON API with endpoints for search, works, editions, authors, and subjects
- Built-in Covers API at `covers.openlibrary.org` (S/M/L sizes up to ~500px)
- Author photos and bios available
- Work/Edition model maps cleanly to our needs (a "work" is the abstract book; "editions" are specific ISBNs/formats)
- Cross-references to Goodreads, Wikidata, Amazon, LibraryThing IDs

**Key endpoints:**
| Purpose | Endpoint |
|---|---|
| Search | `GET /search.json?q={query}&fields=key,title,author_name,cover_i,first_publish_year,edition_count&limit=20&offset=0` |
| Work details | `GET /works/{OLID}.json` |
| Edition details | `GET /books/{OLID}.json` |
| ISBN lookup | `GET /isbn/{isbn}.json` |
| Author details | `GET /authors/{OLID}.json` |
| Author works | `GET /authors/{OLID}/works.json` |
| Cover image | `GET https://covers.openlibrary.org/b/{isbn\|olid\|id}/{value}-{S\|M\|L}.jpg` |
| Author photo | `GET https://covers.openlibrary.org/a/olid/{OLID}-{S\|M\|L}.jpg` |

**Rate limits:** 1 req/sec anonymous, 3 req/sec with `User-Agent` header. Covers API: 100 req/5min for non-OLID lookups.

**Fallback — Google Books API**
- API key required (free from Google Cloud Console)
- ~1,000 requests/day free quota
- Better cover image resolution and more consistent metadata for in-print books
- No author detail endpoint (author names only embedded in volume records)
- Use to fill gaps: missing descriptions, higher-res covers, ISBN cross-referencing

### 2.2 Book Fulfillment Backend: Bookshelf (Primary) + LazyLibrarian (Alternative)

**Primary — Bookshelf** (github.com/pennydreadful/bookshelf)
- Active fork of the now-retired Readarr (archived June 2025 after Goodreads API shutdown)
- Uses the **identical Servarr v1 API** as Radarr/Sonarr — this is critical because Seerr already has a `ServarrBase` class
- Same C#/.NET stack, same auth pattern (apikey header), same endpoint structure
- Handles both ebooks and audiobooks
- Uses Hardcover or Open Library for metadata
- Works with Prowlarr for indexer management
- Default port: 8787

**Key API endpoints (Servarr-compatible):**
| Purpose | Endpoint |
|---|---|
| System status | `GET /api/v1/system/status` |
| Quality profiles | `GET /api/v1/qualityProfile` |
| Root folders | `GET /api/v1/rootFolder` |
| Tags | `GET /api/v1/tag` |
| Book lookup | `GET /api/v1/book/lookup?term={query}` |
| Add book | `POST /api/v1/book` |
| Search for book | `POST /api/v1/command` (body: `{name: "BookSearch", bookIds: [...]}`) |
| Author lookup | `GET /api/v1/author/lookup?term={query}` |
| Queue | `GET /api/v1/queue` |

**Alternative — LazyLibrarian**
- Python-based, actively maintained on GitLab
- Has a custom (non-Servarr) command-based API: `GET /api?apikey=KEY&cmd=COMMAND`
- Would require a completely new API client class (cannot reuse `ServarrBase`)
- Supports more metadata sources: Hardcover, Open Library, Google Books
- Consider as a secondary integration if user demand warrants it

### 2.3 Reading Servers (Downstream, Optional)

These are the "Plex/Jellyfin equivalent" for books — they serve the library to users but don't acquire content:
- **Kavita** — ebooks/comics reading server with REST API
- **Audiobookshelf** — audiobook streaming server with REST API
- **Calibre-Web** — ebook library management

Seerr could optionally scan these for availability status (analogous to Plex/Jellyfin scanning), but this is a future enhancement, not part of the initial implementation.

---

## 3. Architecture & Data Model

### 3.1 Media Type Extension

```typescript
// server/constants/media.ts
export enum MediaType {
  MOVIE = 'movie',
  TV = 'tv',
  BOOK = 'book',  // NEW
}
```

The existing `MediaStatus` and `MediaRequestStatus` enums are already generic and require no changes.

### 3.2 Database Entity Changes

#### Media Entity (`server/entity/Media.ts`)

The existing `Media` entity already uses `mediaType` as a varchar discriminator. Books will use it with these considerations:

| Column | Movie usage | TV usage | Book usage |
|---|---|---|---|
| `mediaType` | `'movie'` | `'tv'` | `'book'` |
| `tmdbId` | TMDb movie ID | TMDb TV ID | **Repurpose as `externalId`** — store Open Library Work OLID (as integer hash or add new varchar column) |
| `tvdbId` | null | TVDB ID | null |
| `imdbId` | IMDb ID | IMDb ID | ISBN-13 (or null) |
| `status` | availability | availability | availability (ebook) |
| `status4k` | 4K availability | 4K availability | audiobook availability (repurpose) |
| `serviceId` | Radarr instance | Sonarr instance | Bookshelf instance |
| `externalServiceId` | Radarr movie ID | Sonarr series ID | Bookshelf book ID |

**New column needed:**

```typescript
@Column({ type: 'varchar', nullable: true })
openLibraryId?: string;  // Open Library Work OLID (e.g., "OL45804W")
```

A database migration will add this column. For books, `openLibraryId` is the canonical external identifier. We keep `tmdbId` as-is for movies/TV and store `0` or a hash for books (since the column is non-nullable integer with an index). Alternatively, we make `tmdbId` nullable and use `openLibraryId` — but the simpler path is adding a new column.

#### MediaRequest Entity (`server/entity/MediaRequest.ts`)

No schema changes needed. The `type` column already stores `MediaType` as varchar. The `is4k` boolean can be repurposed for books to mean "audiobook" vs "ebook" (or we add a new `mediaFormat` column if we want cleaner semantics).

**Recommendation:** Add a `mediaFormat` column for future flexibility:

```typescript
@Column({ type: 'varchar', nullable: true })
mediaFormat?: string;  // 'ebook' | 'audiobook' | null (null = default for movies/TV)
```

#### User Entity (`server/entity/User.ts`)

Add book quota fields (mirroring movie/TV quotas):

```typescript
@Column({ type: 'integer', nullable: true })
bookQuotaLimit?: number;

@Column({ type: 'integer', nullable: true })
bookQuotaDays?: number;
```

#### Season/SeasonRequest Entities

Not used for books. No changes needed. (A future "book series" feature could model series→volumes similarly, but that's out of scope for v1.)

### 3.3 Permissions

Add new permission bits in `server/lib/permissions.ts`:

```typescript
export enum Permission {
  // ... existing permissions ...
  REQUEST_BOOK        = 536870912,    // 2^29
  AUTO_APPROVE_BOOK   = 1 << 30,     // Note: JS bitwise ops are 32-bit
  // For additional book permissions, use BigInt or a second permissions column
}
```

**Note:** The current permission system uses a 32-bit integer bitmask. We're approaching the limit. Two options:
1. Use remaining bits carefully (bits 29-30 are available)
2. Add a `permissions2` column (BigInt) for future expansion

For v1, bits 29-30 suffice for `REQUEST_BOOK` and `AUTO_APPROVE_BOOK`.

### 3.4 Settings

Add book service settings in `server/lib/settings/index.ts`:

```typescript
export interface BookshelfSettings extends DVRSettings {
  // Bookshelf uses the same DVR settings pattern as Radarr/Sonarr:
  // hostname, port, apiKey, useSsl, baseUrl, activeProfileId,
  // activeDirectory, tags, isDefault, syncEnabled, etc.
}

// In the main Settings interface:
export interface AllSettings {
  // ... existing ...
  bookshelf: BookshelfSettings[];  // Array of Bookshelf instances
}

// In MainSettings.defaultQuotas:
defaultQuotas: {
  movie: { quotaLimit?: number; quotaDays?: number };
  tv: { quotaLimit?: number; quotaDays?: number };
  book: { quotaLimit?: number; quotaDays?: number };  // NEW
};
```

---

## 4. Backend Implementation

### 4.1 Open Library API Client

Create `server/api/openlibrary/index.ts`:

```typescript
class OpenLibraryAPI extends ExternalAPI {
  constructor() {
    super(
      'https://openlibrary.org',
      {},  // no API key params
      {
        headers: {
          'User-Agent': 'Seerr/1.0 (https://github.com/your-repo; contact@email.com)',
        },
        nodeCache: cacheManager.getCache('openlibrary'),
      }
    );
  }

  // Search books by query
  public searchBooks(params: { query: string; page?: number; limit?: number }): Promise<OLSearchResponse>;

  // Get work details (the abstract book across all editions)
  public getWork(olid: string): Promise<OLWorkDetails>;

  // Get specific edition
  public getEdition(olid: string): Promise<OLEditionDetails>;

  // Get edition by ISBN
  public getEditionByISBN(isbn: string): Promise<OLEditionDetails>;

  // Get author details
  public getAuthor(olid: string): Promise<OLAuthorDetails>;

  // Get author's works
  public getAuthorWorks(olid: string, params?: { limit?: number; offset?: number }): Promise<OLAuthorWorksResponse>;

  // Build cover image URL
  public static getCoverUrl(coverId: number, size: 'S' | 'M' | 'L'): string;

  // Build author photo URL
  public static getAuthorPhotoUrl(olid: string, size: 'S' | 'M' | 'L'): string;
}
```

**Type definitions** in `server/api/openlibrary/interfaces.ts`:

```typescript
interface OLSearchResponse {
  numFound: number;
  start: number;
  docs: OLSearchResult[];
}

interface OLSearchResult {
  key: string;              // "/works/OL45804W"
  title: string;
  author_name?: string[];
  author_key?: string[];
  first_publish_year?: number;
  cover_i?: number;         // Cover ID for covers API
  edition_count?: number;
  isbn?: string[];
  subject?: string[];
  number_of_pages_median?: number;
  ratings_average?: number;
}

interface OLWorkDetails {
  key: string;
  title: string;
  description?: string | { value: string };
  covers?: number[];
  subjects?: string[];
  authors?: Array<{ author: { key: string }; type?: { key: string } }>;
  first_publish_date?: string;
  links?: Array<{ url: string; title: string }>;
}

interface OLEditionDetails {
  key: string;
  title: string;
  isbn_10?: string[];
  isbn_13?: string[];
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  physical_format?: string;  // "Hardcover", "Paperback", etc.
  covers?: number[];
  works?: Array<{ key: string }>;
  languages?: Array<{ key: string }>;
}

interface OLAuthorDetails {
  key: string;
  name: string;
  bio?: string | { value: string };
  birth_date?: string;
  death_date?: string;
  photos?: number[];
  alternate_names?: string[];
  links?: Array<{ url: string; title: string }>;
  remote_ids?: {
    wikidata?: string;
    goodreads?: string;
    amazon?: string;
  };
}
```

### 4.2 Bookshelf API Client

Create `server/api/servarr/bookshelf.ts`:

```typescript
class BookshelfAPI extends ServarrBase<{ bookId: number }> {

  constructor(options: DVRSettings) {
    super({ ...options });
  }

  // Look up a book by search term, ISBN, or foreign ID
  public async lookupBook(term: string): Promise<BookshelfBook[]>;

  // Get a specific book by Bookshelf internal ID
  public async getBook(id: number): Promise<BookshelfBook>;

  // Get a book by its foreign ID (e.g., Open Library or Hardcover ID)
  public async getBookByForeignId(foreignId: string): Promise<BookshelfBook>;

  // Add a book to Bookshelf (equivalent of RadarrAPI.addMovie)
  public async addBook(options: AddBookOptions): Promise<BookshelfBook>;

  // Trigger a search for a book
  public async searchBook(bookId: number): Promise<void> {
    return this.runCommand('BookSearch', { bookIds: [bookId] });
  }

  // Remove a book
  public async removeBook(bookId: number): Promise<void>;

  // Look up an author
  public async lookupAuthor(term: string): Promise<BookshelfAuthor[]>;

  // Get all books (for sync)
  public async getBooks(): Promise<BookshelfBook[]>;
}

interface AddBookOptions {
  title: string;
  qualityProfileId: number;
  rootFolderPath: string;
  foreignBookId: string;  // Open Library or Hardcover ID
  monitored?: boolean;
  searchNow?: boolean;
  tags?: number[];
  author?: {
    foreignAuthorId: string;
    qualityProfileId: number;
    rootFolderPath: string;
    monitored: boolean;
  };
}
```

### 4.3 Backend Routes

#### Book detail route — `server/routes/book.ts`

```
GET  /api/v1/book/:id          — Get book details (Open Library work)
GET  /api/v1/book/:id/editions — Get editions for a book
GET  /api/v1/book/:id/similar  — Get similar books (via OL subjects)
```

#### Author route — `server/routes/author.ts` (or extend existing person route)

```
GET  /api/v1/author/:id        — Get author details
GET  /api/v1/author/:id/works  — Get author's books
```

#### Search route updates — `server/routes/search.ts`

Add a `type` query parameter to the existing search endpoint:

- `/api/v1/search?query=dune` — **No `type` param (default):** Calls TMDb `searchMulti` only. Returns movies, TV, and people exactly as today. No Open Library call is made. This preserves the current behavior.
- `/api/v1/search?query=dune&type=book` — Calls Open Library only. Returns book results mapped to a unified search result format with `media_type: 'book'`.

The backend never queries both TMDb and Open Library in a single request. The frontend controls which source is queried via the `type` parameter based on the active search filter.

#### Settings routes — `server/routes/settings/bookshelf.ts`

```
GET    /api/v1/settings/bookshelf           — List Bookshelf instances
POST   /api/v1/settings/bookshelf           — Add Bookshelf instance
PUT    /api/v1/settings/bookshelf/:id       — Update Bookshelf instance
DELETE /api/v1/settings/bookshelf/:id       — Delete Bookshelf instance
POST   /api/v1/settings/bookshelf/test      — Test Bookshelf connection
GET    /api/v1/settings/bookshelf/:id/profiles  — Get quality profiles
GET    /api/v1/settings/bookshelf/:id/paths     — Get root folders
```

These follow the exact same pattern as the existing Radarr/Sonarr settings routes.

#### Request route updates — `server/routes/request.ts`

The existing request endpoint handles the `mediaType` field. Add handling for `MediaType.BOOK`:
- Validate book-specific permissions
- Apply book quotas
- On approval, send to Bookshelf via `BookshelfAPI.addBook()`

### 4.4 Request Workflow for Books

```
1. User switches search filter to "Books", searches
   └─> GET /api/v1/search?query=dune&type=book
   └─> OpenLibraryAPI.searchBooks({ query: "dune" })
   └─> Results rendered in UI with cover art, author, year

2. User views book details
   └─> GET /api/v1/book/OL45804W
   └─> OpenLibraryAPI.getWork("OL45804W")
   └─> OpenLibraryAPI.getEdition(...) for edition details
   └─> Render detail page with description, editions, cover, author info

3. User clicks "Request"
   └─> POST /api/v1/request
       { mediaType: "book", mediaId: "OL45804W", mediaFormat: "ebook",
         serverId: 1, profileId: 5, rootFolder: "/books" }

4. Request created (pending or auto-approved based on permissions)
   └─> Media entity created/updated with mediaType='book', openLibraryId='OL45804W'
   └─> MediaRequest entity created with isbn13 stored (from best available edition)
   └─> Notifications sent (Discord, email, etc.)

5. Admin approves (if not auto-approved)
   └─> PUT /api/v1/request/:id  { status: APPROVED }

6. Approved request sent to Bookshelf (ISBN bridge strategy)
   └─> Step 1: Try BookshelfAPI.lookupBook(isbn13)  // ISBN is the most reliable bridge
   └─> Step 2: If no ISBN match, try BookshelfAPI.lookupBook("Title Author")
   └─> Step 3: BookshelfAPI.addBook({
         foreignBookId: matchedBook.foreignBookId,  // Use Bookshelf's own foreign ID
         qualityProfileId: ...,
         rootFolderPath: ...,
         monitored: true,
         searchNow: true,
       })

7. Bookshelf searches indexers → downloads → book available
   └─> Availability sync job detects the book is downloaded
   └─> Media.status updated to AVAILABLE
   └─> Notification sent: "Book is now available"
```

#### 4.4.1 ISBN Bridge: Open Library → Bookshelf

Open Library and Bookshelf use different internal IDs (Open Library OLIDs vs Bookshelf's Hardcover/Goodreads foreign IDs). We bridge them using ISBNs:

1. **At request time:** When a user requests a book, the backend fetches editions from Open Library and stores the best available ISBN-13 on the Media entity's `imdbId` field (repurposed for books — see section 3.2) or a dedicated field.
2. **At fulfillment time:** The approved request handler calls `BookshelfAPI.lookupBook(isbn13)`. Bookshelf's lookup endpoint accepts ISBN and returns the book with its own internal/foreign IDs.
3. **Fallback — title+author search:** If no ISBN is available (~10% of works, typically very old or obscure titles), fall back to `BookshelfAPI.lookupBook("Title Author")` and match on the best result.
4. **Match confirmation:** Before calling `addBook`, log the matched title for debugging. If lookup returns zero results, set the request status to `FAILED` with a message indicating the book could not be found in Bookshelf.

This strategy avoids coupling Seerr to Bookshelf's metadata source configuration and works regardless of whether Bookshelf uses Hardcover, Goodreads, or Open Library internally.

### 4.5 Cover Art Pipeline

Book cover images follow the same pattern as movie/TV posters but with Open Library as the image source instead of TMDb.

#### How movie/TV images work today

1. TMDb returns a `poster_path` (e.g., `/abc123.jpg`)
2. The frontend builds a full URL: `https://image.tmdb.org/t/p/w300_and_h450_face${poster_path}`
3. The `CachedImage` component (`src/components/Common/CachedImage/index.tsx`) renders it
4. If the user has `cacheImages` enabled, URLs are rewritten to `/imageproxy/tmdb/...` so the Seerr backend proxies and caches them
5. No image → placeholder at `/images/seerr_poster_not_found_logo_top.png`

#### How book cover images will work

**Cover URL resolution (in order):**
1. **Open Library cover by ID** — Search results include `cover_i` (integer). Build URL: `https://covers.openlibrary.org/b/id/${cover_i}-L.jpg`
2. **Open Library cover by ISBN** — If `cover_i` is missing but an ISBN exists: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`
3. **Google Books fallback** — If OL has no cover, query Google Books by ISBN and use `volumeInfo.imageLinks.thumbnail` (higher resolution when available)
4. **Placeholder** — A book-specific placeholder image at `/images/seerr_book_not_found.png` (distinct from the movie/TV poster placeholder)

**Author photo URLs:** `https://covers.openlibrary.org/a/olid/${authorOlid}-L.jpg`

**Image sizes used:**
| Context | OL Size | Approx resolution |
|---|---|---|
| Search result cards | `M` | ~160px wide |
| Book detail page hero | `L` | ~500px wide |
| Notifications | `M` | ~160px wide |

**Backend proxy support:**
- Add a new image proxy route: `/imageproxy/openlibrary/` that proxies requests to `covers.openlibrary.org`
- Update `CachedImage` component to rewrite `covers.openlibrary.org` URLs → `/imageproxy/openlibrary/...` when `cacheImages` is enabled
- This keeps the same caching behavior as TMDb images

**Backend response format:**
The book detail and search response models should return a pre-built `coverUrl` field (full URL string) rather than a raw path, since Open Library URLs are structurally different from TMDb paths. The frontend receives a ready-to-use URL and passes it directly to `CachedImage`.

### 4.6 Availability Sync

Extend the existing availability sync job (`server/lib/availabilitySync.ts`) to:
1. Query Bookshelf for books that are monitored and have files
2. Update `Media.status` for book entities accordingly
3. Follow the same pattern used for Radarr/Sonarr sync

---

## 5. Frontend Implementation

### 5.1 New Pages

| Page | Route | Purpose |
|---|---|---|
| Book detail | `/book/[bookId]` | Show book details, editions, request button |
| Author detail | `/author/[authorId]` | Show author bio, photo, bibliography |

### 5.2 New Components

#### `BookDetails` component (`src/components/BookDetails/index.tsx`)
Modeled after `MovieDetails`. Displays:
- Cover image (from Open Library Covers API)
- Title, author(s) with links to author pages
- Description/synopsis
- Publication year, page count, genres/subjects
- Editions list (formats, ISBNs, publishers)
- Request button (with format selection: ebook / audiobook)
- Availability status badge
- Recommendations / similar books

#### `AuthorDetails` component (`src/components/AuthorDetails/index.tsx`)
Displays:
- Author photo (from Open Library)
- Name, bio, birth/death dates
- Bibliography (list of works with covers)

#### Search result cards
Update `src/components/TitleCard` (or create `BookCard`) to render book search results:
- Cover image
- Title + author name
- Publication year
- Status badge (available / requested / etc.)

### 5.3 Search & Filtering

The search page currently has a single search bar with no type filtering. Results are a mixed list of movies, TV shows, and people from TMDb.

#### Search filter design

Add a **segmented control / toggle** above the search results with two options:

```
[ Movies/TV (default) ]  [ Books ]
```

- **Movies/TV** is selected by default. Calls `/api/v1/search?query=...` (no `type` param) — identical to today's behavior. Returns movies, TV shows, and people from TMDb. No Open Library calls are made.
- **Books** is selected explicitly by the user. Calls `/api/v1/search?query=...&type=book`. Returns only book results from Open Library. No TMDb calls are made.

The filter state should be preserved in the URL query string (e.g., `?query=dune&searchType=book`) so that links are shareable and the back button works correctly.

#### Search result rendering

- When **Movies/TV** is active, `ListView` renders results exactly as today: `TitleCard` for movies/TV/collections, `PersonCard` for people.
- When **Books** is active, `ListView` renders book results using `TitleCard` with `mediaType='book'`:
  - Green badge (to join blue for movies, purple for TV)
  - Cover image from Open Library (via `coverUrl` field in response)
  - Title + author name (where movies show title + release year)
  - Publication year
  - Status badge (available / requested / etc.)
  - Link to `/book/[bookId]`
  - Permission check uses `REQUEST_BOOK`

#### Discover pages for books

New discover pages (Phase 4, lower priority):
- `/discover/books` — Browse books, potentially by Open Library subjects
- `/discover/books/genre/[genre]` — Books by genre via OL subjects API (`/subjects/{subject}.json`)

Open Library does not have strong "trending" or "popular" data, so the existing Trending page does **not** add a book option. This can be revisited if a suitable data source emerges.

### 5.4 Bookshelf Settings UI

The Bookshelf configuration experience mirrors the existing Radarr/Sonarr settings exactly. Users configure it from the same **Settings → Services** page.

#### Services page changes (`SettingsServices.tsx`)

The existing services page shows Radarr and Sonarr sections as grids of server instance cards. Add a third section:

```
┌─────────────────────────────────────────────────┐
│  Radarr                                         │
│  ┌──────────┐  ┌──────────┐  ┌─ ─ ─ ─ ─ ─┐    │
│  │ Server 1 │  │ Server 2 │  │ + Add      │    │
│  │ Default  │  │ 4K       │  │   Radarr   │    │
│  └──────────┘  └──────────┘  └─ ─ ─ ─ ─ ─┘    │
│                                                  │
│  Sonarr                                         │
│  ┌──────────┐  ┌─ ─ ─ ─ ─ ─┐                   │
│  │ Server 1 │  │ + Add      │                   │
│  │ Default  │  │   Sonarr   │                   │
│  └──────────┘  └─ ─ ─ ─ ─ ─┘                   │
│                                                  │
│  Bookshelf                          ← NEW       │
│  ┌──────────┐  ┌─ ─ ─ ─ ─ ─┐                   │
│  │ Server 1 │  │ + Add      │                   │
│  │ Default  │  │  Bookshelf │                   │
│  └──────────┘  └─ ─ ─ ─ ─ ─┘                   │
│                                                  │
│  Override Rules                                  │
│  ...                                             │
└─────────────────────────────────────────────────┘
```

Each Bookshelf server instance card shows:
- Server name (links to external URL if configured)
- Status badges: "Default", "SSL" (no 4K concept for books — see note below)
- Internal address (`http://hostname:port`)
- Active quality profile name
- Edit / Delete buttons

**Validation alerts** (same pattern as Radarr/Sonarr):
- Alert if no Bookshelf servers are configured but book requests are enabled
- Alert if no default Bookshelf server is set

#### BookshelfModal (`src/components/Settings/BookshelfModal/index.tsx`)

A Formik-validated modal for adding/editing Bookshelf instances. Opens when clicking "Add Bookshelf Server" or the edit button on an existing card.

**Form fields:**

| Field | Type | Default | Required | Notes |
|---|---|---|---|---|
| `isDefault` | Checkbox | false | No | Only one default allowed; setting new default unsets previous |
| `name` | Text input | — | Yes | Display name for the instance |
| `hostname` | Text input | — | Yes | Hostname or IP |
| `port` | Number input | 8787 | Yes | Bookshelf default port |
| `ssl` | Checkbox | false | No | Use SSL |
| `apiKey` | SensitiveInput | — | Yes | Bookshelf API key |
| `baseUrl` | Text input | — | No | URL base path (e.g., `/bookshelf`) |
| `activeProfileId` | Dropdown | — | Yes | Quality profile — **disabled until test succeeds** |
| `rootFolder` | Dropdown | — | Yes | Root folder — **disabled until test succeeds** |
| `tags` | Multi-select | [] | No | Tags — **disabled until test succeeds** |
| `externalUrl` | Text input | — | No | External-facing URL for link rendering |
| `syncEnabled` | Checkbox | false | No | Enable library scan sync |
| `enableSearch` | Checkbox | true | No | Enable automatic search on add |
| `tagRequests` | Checkbox | false | No | Auto-tag requests with user info |

**No 4K / format split at the instance level.** Unlike Radarr (which has separate 4K instances), Bookshelf handles ebook and audiobook quality profiles within a single instance. The ebook/audiobook distinction is made at request time via the `mediaFormat` field, not at the server level. This keeps configuration simpler.

#### Test connection flow

1. User fills in hostname, port, API key, base URL, SSL
2. User clicks **"Test"** button
3. Frontend sends `POST /api/v1/settings/bookshelf/test` with connection details
4. Backend creates `BookshelfAPI` instance, calls:
   - `getSystemStatus()` → validates connection, gets URL base
   - `getProfiles()` → fetches quality profiles
   - `getRootFolders()` → fetches root folders
   - `getTags()` → fetches available tags
5. On success:
   - Toast: "Bookshelf connection established"
   - Profile, root folder, and tag dropdowns become enabled and populated
6. On failure:
   - Toast error: "Failed to connect to Bookshelf"
   - Dropdowns remain disabled

This is identical to the Radarr/Sonarr test flow since Bookshelf speaks the same Servarr v1 API.

#### Save flow

- **New server:** `POST /api/v1/settings/bookshelf` — backend assigns auto-increment ID, handles default-server logic (unsets previous default)
- **Edit server:** `PUT /api/v1/settings/bookshelf/:id`
- **Delete server:** `DELETE /api/v1/settings/bookshelf/:id`
- After save, `mutate()` refreshes the settings SWR cache and the services page re-renders with the updated card grid

### 5.5 Permissions UI

Update the user permissions editor to include:
- "Request Books" permission toggle
- "Auto-Approve Books" permission toggle

### 5.6 User Quota UI

Add "Book Quota" fields in the user settings/admin panel alongside movie and TV quotas.

---

## 6. Database Migrations

A single migration should:

1. Add `openLibraryId` (varchar, nullable) column to `media` table
2. Add `mediaFormat` (varchar, nullable) column to `media_request` table
3. Add `bookQuotaLimit` (integer, nullable) column to `user` table
4. Add `bookQuotaDays` (integer, nullable) column to `user` table
5. Add index on `media.openLibraryId`

---

## 7. Implementation Phases

### Phase 1 — Foundation (Backend Core)
1. Add `BOOK` to `MediaType` enum
2. Database migration (new columns)
3. Implement `OpenLibraryAPI` client with caching
4. Add Open Library type definitions
5. Add book permissions to the permission enum
6. Add `BookshelfSettings` to settings types

### Phase 2 — API Routes
1. Create `GET /api/v1/book/:id` route
2. Create `GET /api/v1/author/:id` route
3. Update search route to support `type=book`
4. Create Bookshelf settings routes (CRUD + test)
5. Update request route to handle `MediaType.BOOK`

### Phase 3 — Bookshelf Integration
1. Implement `BookshelfAPI` extending `ServarrBase`
2. Wire up request approval → Bookshelf
3. Implement availability sync for books
4. Add Bookshelf service URL building in Media entity

### Phase 4 — Frontend
1. Book detail page and component
2. Author detail page and component
3. Search integration (filter + book results)
4. Request modal with format selection (ebook/audiobook)
5. Bookshelf settings UI
6. Permission and quota UI updates

### Phase 5 — Polish & Testing
1. Notification templates for book events
2. Blocklist/watchlist support for books
3. i18n for all new strings
4. Unit and E2E tests (see Section 7.1)
5. API documentation updates
6. `permissions2` bigint column migration (unblocks future book permission expansion)
7. Book-specific placeholder image (`/images/seerr_book_not_found.png`)

### 7.1 Testing Requirements

The project uses `node:test` + supertest for unit/integration tests and Cypress for E2E tests. Book support tests follow the same patterns and tooling.

**Guiding principle:** Tests should verify book-specific behavior without duplicating coverage of generic infrastructure that already works for movies/TV (e.g., notification dispatch, permission bitmask math, TypeORM save/load). Focus on the new code paths and the boundaries between systems.

#### Unit / Integration Tests (`server/**/*.test.ts`)

Tests use `node:test`, supertest for HTTP assertions, and the existing `setupTestDb()` helper for database isolation (fresh DB per test).

**Open Library API client** (`server/api/openlibrary/index.test.ts`):
| Test | What it verifies |
|---|---|
| `searchBooks` returns mapped results | Response shape matches `OLSearchResponse`; pagination fields pass through |
| `searchBooks` handles empty results | Returns `{ numFound: 0, docs: [] }` gracefully |
| `getWork` normalizes description | Handles both `string` and `{ value: string }` description formats from OL |
| `getWork` handles missing fields | Missing covers, subjects, authors default to empty arrays |
| `getEditionByISBN` follows redirect | ISBN endpoint redirects to edition; client follows and returns edition data |
| `getCoverUrl` builds correct URL | Validates URL format for each size (S/M/L) and key type (id, isbn, olid) |
| `getAuthorPhotoUrl` builds correct URL | Validates author photo URL format |
| Caching works | Second identical call returns cached response without HTTP request |

**Book routes** (`server/routes/book.test.ts`):
| Test | What it verifies |
|---|---|
| `GET /api/v1/book/:id` returns book details | Calls `OpenLibraryAPI.getWork`, returns mapped response with `coverUrl` |
| `GET /api/v1/book/:id` returns 404 for unknown OLID | Graceful error when OL returns no data |
| `GET /api/v1/book/:id/editions` returns edition list | Calls OL editions endpoint, maps to response format |
| `GET /api/v1/author/:id` returns author details | Calls `OpenLibraryAPI.getAuthor`, includes photo URL |
| `GET /api/v1/author/:id/works` returns paginated works | Pagination params pass through correctly |

**Search route — book mode** (`server/routes/search.test.ts`):
| Test | What it verifies |
|---|---|
| `GET /search?query=dune` (no type) calls TMDb only | No Open Library request made; existing behavior preserved |
| `GET /search?query=dune&type=book` calls Open Library only | No TMDb request made; returns book results with `media_type: 'book'` |
| Book search results include `coverUrl` | Each result has a pre-built cover URL or null |
| Book search results include media status | Cross-references DB for existing Media entities with `mediaType='book'` |

**Request route — book handling** (`server/routes/request.test.ts`):
| Test | What it verifies |
|---|---|
| Book request requires `REQUEST_BOOK` permission | Returns 403 without permission; succeeds with it |
| Book request respects book quota | Rejects when quota exceeded; allows when within quota |
| Book request creates Media entity with `openLibraryId` | DB record has correct `mediaType='book'` and `openLibraryId` |
| Book request stores ISBN-13 on Media entity | Best ISBN from OL editions is persisted |
| Book request with `AUTO_APPROVE_BOOK` auto-approves | Status is `APPROVED` immediately; notification sent |
| Book request without auto-approve is `PENDING` | Status is `PENDING`; notification sent |
| Duplicate book request is rejected | Returns error if same `openLibraryId` already has an active request |

**ISBN bridge / fulfillment logic** (`server/lib/bookFulfillment.test.ts`):
| Test | What it verifies |
|---|---|
| Approved request looks up book by ISBN in Bookshelf | `BookshelfAPI.lookupBook(isbn)` is called first |
| Falls back to title+author when no ISBN | `BookshelfAPI.lookupBook("Title Author")` is called |
| Calls `addBook` with Bookshelf's foreign ID | Uses the ID from Bookshelf's lookup response, not the OL ID |
| Sets request to FAILED when Bookshelf lookup returns nothing | Request status updated; no `addBook` call made |
| Triggers search after adding book | `BookshelfAPI.searchBook()` called when `searchNow: true` |

**Bookshelf settings routes** (`server/routes/settings/bookshelf.test.ts`):
| Test | What it verifies |
|---|---|
| `POST /settings/bookshelf` creates instance | Settings file updated; auto-increment ID assigned |
| `POST /settings/bookshelf` enforces single default | Setting new default unsets previous default |
| `PUT /settings/bookshelf/:id` updates instance | Existing instance modified; others untouched |
| `DELETE /settings/bookshelf/:id` removes instance | Instance removed from settings; 404 on re-fetch |
| `POST /settings/bookshelf/test` validates connection | Calls `BookshelfAPI.getSystemStatus`, returns profiles/folders/tags |
| `POST /settings/bookshelf/test` with bad credentials returns 500 | Returns "Failed to connect" message |

**Regression: movie/TV unaffected** (`server/routes/search.test.ts`, `server/routes/request.test.ts`):
| Test | What it verifies |
|---|---|
| Movie search unchanged | `GET /search?query=dune` returns same results as before book support |
| Movie request unchanged | `POST /request` with `mediaType: 'movie'` works identically |
| TV request unchanged | `POST /request` with `mediaType: 'tv'` works identically |

#### E2E Tests (`cypress/e2e/`)

E2E tests use Cypress with the existing `cy.loginAsAdmin()` / `cy.loginAsUser()` session helpers and the test database seeded via `prepareTestDb.ts`.

**Book search flow** (`cypress/e2e/book-search.cy.ts`):
- Default search shows Movies/TV results (no book results present)
- Clicking "Books" filter switches to book results from Open Library
- Book results display cover image, title, author, year
- Clicking a book result navigates to `/book/[bookId]`
- Switching back to "Movies/TV" restores TMDb results
- Search filter state persists in URL (`?searchType=book`)

**Book detail page** (`cypress/e2e/book-details.cy.ts`):
- Book detail page loads with cover, title, author, description
- Author name links to `/author/[authorId]`
- Editions section lists available formats
- Request button is visible for users with `REQUEST_BOOK` permission
- Request button is hidden for users without permission

**Book request flow** (`cypress/e2e/book-request.cy.ts`):
- User can request a book (ebook format)
- Request appears in pending requests list
- Admin can approve the request
- After approval, status updates on the book detail page
- User can request audiobook format for same book (separate request)

**Bookshelf settings** (`cypress/e2e/settings/bookshelf.cy.ts`):
- "Add Bookshelf Server" button appears on services page
- Modal opens with correct default values (port 8787)
- Profile/folder/tag dropdowns are disabled before test
- Test connection flow enables dropdowns (requires mock or test Bookshelf instance)
- Save creates server instance card on services page
- Edit modal pre-fills existing values
- Delete removes the card

**Regression** — existing Cypress tests (`movie-details.cy.ts`, `tv-details.cy.ts`, `discover.cy.ts`) must continue to pass without modification. This is the primary gate for the core tenet.

#### Test Data

**Database seeding** — extend `seedTestDb.ts` to:
- Create a test Media entity with `mediaType: 'book'` and `openLibraryId: 'OL45804W'` (Dune)
- Create a test MediaRequest for that book in `PENDING` status
- Ensure existing movie/TV seed data is unchanged

**Cypress fixtures** — add `cypress/fixtures/book-search.json` and `cypress/fixtures/book-details.json` with sample Open Library API responses for deterministic E2E testing (intercept OL API calls with `cy.intercept`).

#### New Test Files

| File | Framework | What it covers |
|---|---|---|
| `server/api/openlibrary/index.test.ts` | node:test | OL API client methods, caching, URL building |
| `server/routes/book.test.ts` | node:test + supertest | Book and author detail routes |
| `server/routes/search.test.ts` | node:test + supertest | Book search mode + regression for movie/TV search |
| `server/routes/request.test.ts` | node:test + supertest | Book request creation, permissions, quotas + regression |
| `server/lib/bookFulfillment.test.ts` | node:test | ISBN bridge logic, Bookshelf lookup/add, failure handling |
| `server/routes/settings/bookshelf.test.ts` | node:test + supertest | Bookshelf settings CRUD, test connection, default logic |
| `cypress/e2e/book-search.cy.ts` | Cypress | Search filter toggle, book results rendering |
| `cypress/e2e/book-details.cy.ts` | Cypress | Book detail page content, author links, permissions |
| `cypress/e2e/book-request.cy.ts` | Cypress | Full request→approve flow for books |
| `cypress/e2e/settings/bookshelf.cy.ts` | Cypress | Bookshelf server configuration UI |
| `cypress/fixtures/book-search.json` | Fixture | Sample OL search response |
| `cypress/fixtures/book-details.json` | Fixture | Sample OL work/edition response |

---

## 8. Key Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Metadata provider | Open Library (primary) | Free, no auth, largest free catalog, covers + author data included |
| Fallback metadata | Google Books | Fill gaps in descriptions/covers for popular titles |
| Fulfillment backend | Bookshelf | Servarr-compatible API → reuse `ServarrBase`, same patterns as Radarr/Sonarr |
| OL→Bookshelf ID bridge | ISBN-13 lookup with title+author fallback | Decouples Seerr from Bookshelf's metadata source config; works ~90% via ISBN, remainder via fuzzy match |
| External ID storage | New `openLibraryId` column | Keep `tmdbId` for movies/TV, add varchar column for OL Work OLIDs |
| Cover art source | Open Library Covers API + Google Books fallback | OL covers by ID/ISBN as primary; Google Books thumbnail as fallback; book-specific placeholder as last resort |
| Image proxying | New `/imageproxy/openlibrary/` route | Same caching pattern as existing TMDb proxy; CachedImage component extended |
| Search architecture | `type` query param, default omitted (Movies/TV) | No OL calls unless user selects Books filter. Zero performance impact on movie/TV search |
| Search filter UI | `Movies/TV (default)` / `Books` toggle | Preserves existing UX as default; book search is opt-in |
| Audiobook vs ebook | `mediaFormat` column on request | Allows requesting both formats; maps to different quality profiles in Bookshelf |
| Book series | Out of scope for v1 | Could add later using Season/SeasonRequest pattern (series→volumes) |
| Reading server scan | Out of scope for v1 | Kavita/Audiobookshelf availability scanning is a future enhancement |
| Permission bits | Use bits 29-30 | Sufficient for v1; `permissions2` column migration planned for Phase 5 |

---

## 9. Risks & Mitigations

| Risk | Impact | Resolution |
|---|---|---|
| Open Library rate limits (1-3 req/sec) | Search/detail slowness under load | **Resolved by design.** Book search only fires when the user explicitly selects the Books filter — no OL calls on the default Movies/TV path. The existing `ExternalAPI` cache layer (same one used for TMDb) caches responses. OL's 3 req/sec with `User-Agent` header is sufficient for single-user search-and-browse patterns. |
| Open Library inconsistent data quality | Missing descriptions, covers, page counts for obscure books | **Resolved with fallback chain.** Cover images: OL cover by ID → OL cover by ISBN → Google Books thumbnail → book-specific placeholder. Descriptions: OL work description → Google Books description → "No description available." Page counts: OL `number_of_pages_median` from search, or edition-specific count, or omit gracefully. The UI must handle all fields as optional. |
| Bookshelf uses Hardcover IDs, not Open Library IDs | ID mismatch between metadata provider and fulfillment backend | **Resolved with ISBN bridge.** See section 4.4.1. At request time, store the best available ISBN-13 from Open Library editions. At fulfillment time, look up the book in Bookshelf by ISBN. Fall back to title+author search for the ~10% of works without ISBNs. This decouples Seerr from Bookshelf's metadata source. |
| Bookshelf project instability (community fork) | Backend could become unmaintained | **Acceptable risk.** `BookshelfAPI` extends `ServarrBase` using the standard Servarr v1 API contract shared by Radarr, Sonarr, and all *arr forks. If Bookshelf is abandoned, any successor speaking the same API (e.g., Chaptarr, or a future fork) drops in with minimal code changes — just a new settings section. No action needed beyond designing to the `ServarrBase` interface. |
| Permission bitmask near 32-bit limit | Can't add more granular book permissions later | **Resolved for v1, flagged for v2.** Bits 29-30 give us `REQUEST_BOOK` and `AUTO_APPROVE_BOOK`, which covers the minimum viable permission set. A `permissions2` bigint column migration is added as a Phase 5 task to unblock future expansion (e.g., `AUTO_REQUEST_BOOK`, `REQUEST_4K_BOOK` for audiobook-specific permissions). |
| Open Library OLID format (string, not integer) | Doesn't fit existing `tmdbId` integer column | **Resolved.** New `openLibraryId` varchar column on the Media entity. `tmdbId` is left as-is for movies/TV. For books, `tmdbId` is set to `0` (the column is non-nullable). All book lookups use `openLibraryId`. |
| Degrading movie/TV search performance | Adding book search could slow down every search query | **Resolved by design.** Search defaults to Movies/TV (TMDb only). Open Library is only queried when the user explicitly selects the Books filter. The backend never queries both APIs in a single request. Zero impact on movie/TV search latency. |

---

## 10. File Change Summary

### New Files
| File | Purpose |
|---|---|
| `server/api/openlibrary/index.ts` | Open Library API client |
| `server/api/openlibrary/interfaces.ts` | TypeScript types for OL responses |
| `server/api/servarr/bookshelf.ts` | Bookshelf API client (extends ServarrBase) |
| `server/routes/book.ts` | Book detail API routes |
| `server/routes/author.ts` | Author detail API routes |
| `server/routes/settings/bookshelf.ts` | Bookshelf settings CRUD routes |
| `server/routes/imageproxy.ts` (or update existing) | Add `/imageproxy/openlibrary/` proxy route |
| `server/models/Book.ts` | Book response model/mapper |
| `server/models/Author.ts` | Author response model/mapper |
| `src/pages/book/[bookId].tsx` | Book detail page |
| `src/pages/author/[authorId].tsx` | Author detail page |
| `src/components/BookDetails/index.tsx` | Book detail component |
| `src/components/AuthorDetails/index.tsx` | Author detail component |
| `src/components/Search/SearchFilter.tsx` | Movies/TV \| Books toggle control |
| `src/components/Settings/BookshelfModal/index.tsx` | Bookshelf add/edit modal (mirrors RadarrModal) |
| `public/images/seerr_book_not_found.png` | Book-specific placeholder cover image |
| `server/migration/*-AddBookSupport.ts` | Database migration |

### Modified Files
| File | Change |
|---|---|
| `server/constants/media.ts` | Add `BOOK` to `MediaType` enum |
| `server/entity/Media.ts` | Add `openLibraryId` column; update `setServiceUrl()` for Bookshelf |
| `server/entity/MediaRequest.ts` | Add `mediaFormat` column; add book branch in `request()` static method |
| `server/entity/User.ts` | Add `bookQuotaLimit`, `bookQuotaDays` columns |
| `server/lib/permissions.ts` | Add `REQUEST_BOOK`, `AUTO_APPROVE_BOOK` bits |
| `server/lib/settings/index.ts` | Add `BookshelfSettings` interface; add `bookshelf[]` to settings |
| `server/routes/search.ts` | Add `type=book` param handling; query Open Library when type is book |
| `server/routes/request.ts` | Add `MediaType.BOOK` handling |
| `server/routes/index.ts` | Register book, author, and bookshelf settings routes |
| `server/lib/availabilitySync.ts` | Add Bookshelf availability checking |
| `src/pages/search.tsx` | Add SearchFilter toggle (Movies/TV \| Books), wire `searchType` to URL and API calls |
| `src/components/RequestButton/index.tsx` | Handle book requests with format selection |
| `src/components/TitleCard/index.tsx` | Add `'book'` mediaType handling: green badge, author subtitle, `/book/` link routing |
| `src/components/Common/CachedImage/index.tsx` | Add `covers.openlibrary.org` → `/imageproxy/openlibrary/` rewrite rule |
| `src/components/Common/ListView/index.tsx` | Add `'book'` case to mediaType switch for rendering book results |
| `src/components/Settings/SettingsServices.tsx` | Add Bookshelf section (instance cards, "Add Bookshelf Server" button, validation alerts) |
| `src/components/UserProfile/index.tsx` | Add book quota display |
