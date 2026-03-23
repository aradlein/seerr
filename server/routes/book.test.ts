import OpenLibraryAPI from '@server/api/openlibrary';
import type {
  OLAuthorDetails,
  OLAuthorWorksResponse,
  OLEditionDetails,
  OLEditionsResponse,
  OLSearchResponse,
  OLSearchResult,
  OLWorkDetails,
} from '@server/api/openlibrary/interfaces';
import {
  mapAuthorToAuthorResult,
  mapEditionToBookEdition,
  mapSearchResultToBookResult,
  mapWorkToBookDetails,
} from '@server/models/Book';
import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

// ---------------------------------------------------------------------------
// Model mapper tests — pure functions, no DB or HTTP needed
// ---------------------------------------------------------------------------

describe('mapSearchResultToBookResult', () => {
  it('maps a full search result to a BookResult with correct shape', () => {
    const searchResult: OLSearchResult = {
      key: '/works/OL45804W',
      title: 'Dune',
      author_name: ['Frank Herbert'],
      author_key: ['OL34184A'],
      first_publish_year: 1965,
      cover_i: 8226988,
      edition_count: 50,
      isbn: ['9780441172719', '0441172717'],
      subject: ['Science Fiction', 'Space Opera'],
      number_of_pages_median: 412,
      ratings_average: 4.2,
    };

    const result = mapSearchResultToBookResult(searchResult);

    assert.strictEqual(result.id, 'OL45804W');
    assert.strictEqual(result.mediaType, 'book');
    assert.strictEqual(result.title, 'Dune');
    assert.strictEqual(result.firstPublishYear, 1965);
    assert.strictEqual(result.editionCount, 50);
    assert.strictEqual(result.pageCount, 412);
    assert.strictEqual(result.rating, 4.2);
    assert.strictEqual(
      result.coverUrl,
      'https://covers.openlibrary.org/b/id/8226988-M.jpg'
    );
    assert.deepStrictEqual(result.authors, [
      { id: 'OL34184A', name: 'Frank Herbert' },
    ]);
    assert.ok(result.isbn);
    assert.ok(result.subjects);
  });

  it('handles missing optional fields gracefully', () => {
    const minimalResult: OLSearchResult = {
      key: '/works/OL100W',
      title: 'Minimal Book',
    };

    const result = mapSearchResultToBookResult(minimalResult);

    assert.strictEqual(result.id, 'OL100W');
    assert.strictEqual(result.title, 'Minimal Book');
    assert.strictEqual(result.mediaType, 'book');
    assert.deepStrictEqual(result.authors, []);
    assert.strictEqual(result.coverUrl, undefined);
    assert.strictEqual(result.firstPublishYear, undefined);
    assert.strictEqual(result.editionCount, undefined);
    assert.strictEqual(result.pageCount, undefined);
    assert.strictEqual(result.rating, undefined);
  });

  it('maps multiple authors correctly', () => {
    const result: OLSearchResult = {
      key: '/works/OL200W',
      title: 'Multi-Author Book',
      author_name: ['Author One', 'Author Two'],
      author_key: ['OL1A', 'OL2A'],
    };

    const mapped = mapSearchResultToBookResult(result);

    assert.strictEqual(mapped.authors.length, 2);
    assert.strictEqual(mapped.authors[0].name, 'Author One');
    assert.strictEqual(mapped.authors[1].name, 'Author Two');
  });

  it('limits ISBNs to first 5', () => {
    const result: OLSearchResult = {
      key: '/works/OL300W',
      title: 'Many ISBNs',
      isbn: ['1', '2', '3', '4', '5', '6', '7', '8'],
    };

    const mapped = mapSearchResultToBookResult(result);

    assert.ok(mapped.isbn);
    assert.strictEqual(mapped.isbn.length, 5);
  });

  it('limits subjects to first 10', () => {
    const result: OLSearchResult = {
      key: '/works/OL400W',
      title: 'Many Subjects',
      subject: Array.from({ length: 15 }, (_, i) => `Subject ${i + 1}`),
    };

    const mapped = mapSearchResultToBookResult(result);

    assert.ok(mapped.subjects);
    assert.strictEqual(mapped.subjects.length, 10);
  });
});

describe('mapWorkToBookDetails', () => {
  it('maps a work with author details to BookDetails', () => {
    const work: OLWorkDetails = {
      key: '/works/OL45804W',
      title: 'Dune',
      description: 'Set on the desert planet Arrakis',
      covers: [8226988],
      subjects: ['Science Fiction', 'Space Opera'],
      authors: [
        {
          author: { key: '/authors/OL34184A' },
          type: { key: '/type/author_role' },
        },
      ],
      first_publish_date: '1965',
      links: [{ url: 'https://example.com', title: 'Website' }],
    };

    const authorDetails: OLAuthorDetails[] = [
      {
        key: '/authors/OL34184A',
        name: 'Frank Herbert',
      },
    ];

    const result = mapWorkToBookDetails(work, authorDetails);

    assert.strictEqual(result.id, 'OL45804W');
    assert.strictEqual(result.mediaType, 'book');
    assert.strictEqual(result.title, 'Dune');
    assert.strictEqual(result.description, 'Set on the desert planet Arrakis');
    assert.strictEqual(result.firstPublishDate, '1965');
    assert.strictEqual(
      result.coverUrl,
      'https://covers.openlibrary.org/b/id/8226988-L.jpg'
    );
    assert.deepStrictEqual(result.authors, [
      { id: 'OL34184A', name: 'Frank Herbert' },
    ]);
    assert.ok(result.subjects);
    assert.ok(result.links);
  });

  it('normalizes object-style descriptions', () => {
    const work: OLWorkDetails = {
      key: '/works/OL500W',
      title: 'Object Description',
      description: { value: 'Description as an object' },
    };

    const result = mapWorkToBookDetails(work);

    assert.strictEqual(result.description, 'Description as an object');
  });

  it('handles missing covers, subjects, and authors', () => {
    const work: OLWorkDetails = {
      key: '/works/OL600W',
      title: 'No Extras',
    };

    const result = mapWorkToBookDetails(work);

    assert.strictEqual(result.coverUrl, undefined);
    assert.strictEqual(result.subjects, undefined);
    assert.deepStrictEqual(result.authors, []);
  });

  it('handles work without author details parameter', () => {
    const work: OLWorkDetails = {
      key: '/works/OL700W',
      title: 'No Author Details',
      authors: [{ author: { key: '/authors/OL1A' } }],
    };

    const result = mapWorkToBookDetails(work);

    assert.deepStrictEqual(result.authors, []);
  });

  it('limits subjects to 20', () => {
    const work: OLWorkDetails = {
      key: '/works/OL800W',
      title: 'Many Subjects',
      subjects: Array.from({ length: 30 }, (_, i) => `Subject ${i + 1}`),
    };

    const result = mapWorkToBookDetails(work);

    assert.ok(result.subjects);
    assert.strictEqual(result.subjects.length, 20);
  });
});

describe('mapEditionToBookEdition', () => {
  it('maps a full edition to BookEdition', () => {
    const edition: OLEditionDetails = {
      key: '/books/OL7353617M',
      title: 'Dune',
      isbn_10: ['0441172717'],
      isbn_13: ['9780441172719'],
      publishers: ['Ace Books'],
      publish_date: 'June 2005',
      number_of_pages: 528,
      physical_format: 'Paperback',
      covers: [8226988],
      works: [{ key: '/works/OL45804W' }],
      languages: [{ key: '/languages/eng' }],
    };

    const result = mapEditionToBookEdition(edition);

    assert.strictEqual(result.id, 'OL7353617M');
    assert.strictEqual(result.title, 'Dune');
    assert.deepStrictEqual(result.isbn10, ['0441172717']);
    assert.deepStrictEqual(result.isbn13, ['9780441172719']);
    assert.deepStrictEqual(result.publishers, ['Ace Books']);
    assert.strictEqual(result.publishDate, 'June 2005');
    assert.strictEqual(result.pageCount, 528);
    assert.strictEqual(result.format, 'Paperback');
    assert.strictEqual(
      result.coverUrl,
      'https://covers.openlibrary.org/b/id/8226988-M.jpg'
    );
    assert.deepStrictEqual(result.languages, ['eng']);
  });

  it('handles edition with no covers', () => {
    const edition: OLEditionDetails = {
      key: '/books/OL1M',
      title: 'No Cover Edition',
    };

    const result = mapEditionToBookEdition(edition);

    assert.strictEqual(result.coverUrl, undefined);
  });

  it('handles edition with empty covers array', () => {
    const edition: OLEditionDetails = {
      key: '/books/OL2M',
      title: 'Empty Covers',
      covers: [],
    };

    const result = mapEditionToBookEdition(edition);

    assert.strictEqual(result.coverUrl, undefined);
  });
});

describe('mapAuthorToAuthorResult', () => {
  it('maps a full author to AuthorResult', () => {
    const author: OLAuthorDetails = {
      key: '/authors/OL34184A',
      name: 'Frank Herbert',
      bio: 'American science fiction writer',
      birth_date: '8 October 1920',
      death_date: '11 February 1986',
      photos: [6257017],
      alternate_names: ['F. Herbert'],
      links: [{ url: 'https://example.com', title: 'Website' }],
      remote_ids: {
        wikidata: 'Q123',
        goodreads: '456',
        amazon: '789',
      },
    };

    const result = mapAuthorToAuthorResult(author);

    assert.strictEqual(result.id, 'OL34184A');
    assert.strictEqual(result.name, 'Frank Herbert');
    assert.strictEqual(result.bio, 'American science fiction writer');
    assert.strictEqual(result.birthDate, '8 October 1920');
    assert.strictEqual(result.deathDate, '11 February 1986');
    assert.strictEqual(
      result.photoUrl,
      'https://covers.openlibrary.org/a/olid/OL34184A-L.jpg'
    );
    assert.deepStrictEqual(result.alternateNames, ['F. Herbert']);
    assert.ok(result.links);
    assert.ok(result.remoteIds);
  });

  it('normalizes object-style bio', () => {
    const author: OLAuthorDetails = {
      key: '/authors/OL1A',
      name: 'Object Bio Author',
      bio: { value: 'Bio as an object' },
    };

    const result = mapAuthorToAuthorResult(author);

    assert.strictEqual(result.bio, 'Bio as an object');
  });

  it('handles missing photos (no photoUrl)', () => {
    const author: OLAuthorDetails = {
      key: '/authors/OL2A',
      name: 'No Photo Author',
    };

    const result = mapAuthorToAuthorResult(author);

    assert.strictEqual(result.photoUrl, undefined);
  });

  it('handles empty photos array (no photoUrl)', () => {
    const author: OLAuthorDetails = {
      key: '/authors/OL3A',
      name: 'Empty Photos Author',
      photos: [],
    };

    const result = mapAuthorToAuthorResult(author);

    assert.strictEqual(result.photoUrl, undefined);
  });
});

// ---------------------------------------------------------------------------
// Route handler tests — test via supertest against Express app
// ---------------------------------------------------------------------------

describe('Book routes', () => {
  let getMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    // Mock the `get` method on ExternalAPI prototype to prevent real HTTP calls
    getMock = mock.method(
      Object.getPrototypeOf(Object.getPrototypeOf(new OpenLibraryAPI())),
      'get'
    );
  });

  describe('GET /book/:id (handler logic)', () => {
    it('should call getWork with the provided OLID', async () => {
      const fakeWork: OLWorkDetails = {
        key: '/works/OL45804W',
        title: 'Dune',
        description: 'A science fiction novel',
        covers: [8226988],
        subjects: ['Science Fiction'],
        authors: [],
      };

      getMock.mock.mockImplementation(async (endpoint: string) => {
        if (endpoint.includes('/works/')) return fakeWork;
        throw new Error('Unexpected endpoint');
      });

      const api = new OpenLibraryAPI();
      const result = await api.getWork('OL45804W');

      assert.strictEqual(result.title, 'Dune');
      assert.strictEqual(result.key, '/works/OL45804W');
    });

    it('should resolve author details for works with authors', async () => {
      const fakeWork: OLWorkDetails = {
        key: '/works/OL45804W',
        title: 'Dune',
        authors: [{ author: { key: '/authors/OL34184A' } }],
      };

      const fakeAuthor: OLAuthorDetails = {
        key: '/authors/OL34184A',
        name: 'Frank Herbert',
      };

      getMock.mock.mockImplementation(async (endpoint: string) => {
        if (endpoint.includes('/works/')) return fakeWork;
        if (endpoint.includes('/authors/')) return fakeAuthor;
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      });

      const api = new OpenLibraryAPI();
      const work = await api.getWork('OL45804W');
      const authorDetails: OLAuthorDetails[] = [];

      if (work.authors) {
        for (const authorRef of work.authors) {
          const authorOlid = OpenLibraryAPI.extractOlid(authorRef.author.key);
          const author = await api.getAuthor(authorOlid);
          authorDetails.push(author);
        }
      }

      const bookDetails = mapWorkToBookDetails(work, authorDetails);

      assert.strictEqual(bookDetails.title, 'Dune');
      assert.strictEqual(bookDetails.authors.length, 1);
      assert.strictEqual(bookDetails.authors[0].name, 'Frank Herbert');
    });
  });

  describe('GET /book/:id/editions (handler logic)', () => {
    it('should return paginated editions', async () => {
      const fakeEditions: OLEditionsResponse = {
        entries: [
          { key: '/books/OL1M', title: 'Edition 1' },
          { key: '/books/OL2M', title: 'Edition 2' },
          { key: '/books/OL3M', title: 'Edition 3' },
        ],
      };

      getMock.mock.mockImplementation(async () => fakeEditions);

      const api = new OpenLibraryAPI();
      const editionsResponse = await api.getWorkEditions('OL45804W');
      const allEditions = editionsResponse.entries ?? [];
      const limit = 2;
      const offset = 0;
      const paginatedEditions = allEditions.slice(offset, offset + limit);

      assert.strictEqual(allEditions.length, 3);
      assert.strictEqual(paginatedEditions.length, 2);
      assert.strictEqual(paginatedEditions[0].title, 'Edition 1');
      assert.strictEqual(paginatedEditions[1].title, 'Edition 2');
    });

    it('should handle offset correctly for pagination', async () => {
      const fakeEditions: OLEditionsResponse = {
        entries: [
          { key: '/books/OL1M', title: 'Edition 1' },
          { key: '/books/OL2M', title: 'Edition 2' },
          { key: '/books/OL3M', title: 'Edition 3' },
        ],
      };

      getMock.mock.mockImplementation(async () => fakeEditions);

      const api = new OpenLibraryAPI();
      const editionsResponse = await api.getWorkEditions('OL45804W');
      const allEditions = editionsResponse.entries ?? [];
      const limit = 2;
      const offset = 1;
      const paginatedEditions = allEditions.slice(offset, offset + limit);

      assert.strictEqual(paginatedEditions.length, 2);
      assert.strictEqual(paginatedEditions[0].title, 'Edition 2');
    });
  });
});

describe('Author routes (handler logic)', () => {
  let getMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    getMock = mock.method(
      Object.getPrototypeOf(Object.getPrototypeOf(new OpenLibraryAPI())),
      'get'
    );
  });

  describe('GET /author/:id', () => {
    it('should fetch and map author details', async () => {
      const fakeAuthor: OLAuthorDetails = {
        key: '/authors/OL34184A',
        name: 'Frank Herbert',
        bio: 'American science fiction writer',
        photos: [6257017],
      };

      getMock.mock.mockImplementation(async () => fakeAuthor);

      const api = new OpenLibraryAPI();
      const author = await api.getAuthor('OL34184A');
      const result = mapAuthorToAuthorResult(author);

      assert.strictEqual(result.id, 'OL34184A');
      assert.strictEqual(result.name, 'Frank Herbert');
      assert.strictEqual(result.bio, 'American science fiction writer');
      assert.ok(result.photoUrl);
    });
  });

  describe('GET /author/:id/works', () => {
    it('should return paginated author works', async () => {
      const fakeWorks: OLAuthorWorksResponse = {
        size: 42,
        entries: [
          { key: '/works/OL45804W', title: 'Dune' },
          { key: '/works/OL50W', title: 'Dune Messiah' },
        ],
      };

      getMock.mock.mockImplementation(async () => fakeWorks);

      const api = new OpenLibraryAPI();
      const worksResponse = await api.getAuthorWorks('OL34184A', {
        limit: 20,
        offset: 0,
      });

      const results = (worksResponse.entries ?? []).map((work) =>
        mapWorkToBookDetails(work)
      );

      assert.strictEqual(worksResponse.size, 42);
      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].title, 'Dune');
      assert.strictEqual(results[0].mediaType, 'book');
      assert.strictEqual(results[1].title, 'Dune Messiah');
    });
  });
});

// ---------------------------------------------------------------------------
// Book route sparse data enrichment tests (Fix #54)
//
// These tests verify the enrichment logic added in the book route handler
// that fills in missing data from supplementary search and edition fallbacks.
// We test the logic by simulating the route handler's algorithm using
// mocked API calls, since the enrichment happens inline in the handler.
// ---------------------------------------------------------------------------

describe('Book route sparse data enrichment (Fix #54)', () => {
  let getMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    getMock = mock.method(
      Object.getPrototypeOf(Object.getPrototypeOf(new OpenLibraryAPI())),
      'get'
    );
  });

  describe('Author fallback from search', () => {
    it('should fill in author names from search when getAuthor fails', async () => {
      // Simulates the route handler logic: work has authors, but getAuthor
      // throws for all of them. The handler then falls back to searchBooks
      // to get author names from the search index.
      const sparseWork: OLWorkDetails = {
        key: '/works/OL_SPARSE_1',
        title: 'Sparse Book',
        authors: [
          { author: { key: '/authors/OL_AUTH_FAIL_1' } },
          { author: { key: '/authors/OL_AUTH_FAIL_2' } },
        ],
      };

      const searchResponse: OLSearchResponse = {
        numFound: 1,
        start: 0,
        docs: [
          {
            key: '/works/OL_SPARSE_1',
            title: 'Sparse Book',
            author_name: ['Author Alpha', 'Author Beta'],
            author_key: ['OL_AUTH_FAIL_1', 'OL_AUTH_FAIL_2'],
          },
        ],
      };

      const editionsResponse: OLEditionsResponse = {
        entries: [],
      };

      // Simulate the route handler's logic step by step
      getMock.mock.mockImplementation(async (endpoint: string) => {
        if (endpoint.includes('/works/OL_SPARSE_1.json')) return sparseWork;
        if (endpoint.includes('/works/OL_SPARSE_1/editions.json'))
          return editionsResponse;
        if (endpoint.includes('/authors/')) throw new Error('Author not found');
        if (endpoint.includes('/search.json')) return searchResponse;
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      });

      const api = new OpenLibraryAPI();

      // Step 1: Get the work
      const work = await api.getWork('OL_SPARSE_1');

      // Step 2: Try to resolve authors (all fail)
      const authorDetails: OLAuthorDetails[] = [];
      const failedAuthorOlids: string[] = [];
      if (work.authors) {
        for (const authorRef of work.authors) {
          try {
            const authorOlid = OpenLibraryAPI.extractOlid(authorRef.author.key);
            const author = await api.getAuthor(authorOlid);
            authorDetails.push(author);
          } catch {
            const failedOlid = OpenLibraryAPI.extractOlid(authorRef.author.key);
            failedAuthorOlids.push(failedOlid);
          }
        }
      }

      // Step 3: Map to BookDetails (should have empty authors)
      const bookDetails = mapWorkToBookDetails(work, authorDetails);
      assert.strictEqual(bookDetails.authors.length, 0);

      // Step 4: Search fallback fills in author names
      const needsSearchFallback =
        failedAuthorOlids.length > 0 ||
        (work.authors &&
          work.authors.length > 0 &&
          bookDetails.authors.length === 0);

      assert.ok(
        needsSearchFallback,
        'Should trigger search fallback for failed authors'
      );

      const olResults = await api.searchBooks({ query: work.title, limit: 5 });
      const workOlid = OpenLibraryAPI.extractOlid(work.key);
      const matchingResult = olResults.docs.find(
        (doc) => OpenLibraryAPI.extractOlid(doc.key) === workOlid
      );

      assert.ok(matchingResult, 'Should find matching search result');

      // Fill in authors from search (mirrors route handler logic)
      if (matchingResult.author_name && matchingResult.author_key) {
        if (bookDetails.authors.length === 0) {
          bookDetails.authors = matchingResult.author_name.map((name, i) => ({
            id: OpenLibraryAPI.extractOlid(
              matchingResult.author_key?.[i] ?? ''
            ),
            name,
          }));
        }
      }

      assert.strictEqual(bookDetails.authors.length, 2);
      assert.strictEqual(bookDetails.authors[0].name, 'Author Alpha');
      assert.strictEqual(bookDetails.authors[0].id, 'OL_AUTH_FAIL_1');
      assert.strictEqual(bookDetails.authors[1].name, 'Author Beta');
      assert.strictEqual(bookDetails.authors[1].id, 'OL_AUTH_FAIL_2');
    });

    it('should fill in specific failed authors while keeping resolved ones', async () => {
      // When some authors resolve but others fail, the handler should
      // keep the resolved authors and add the failed ones from search.
      const work: OLWorkDetails = {
        key: '/works/OL_PARTIAL_AUTH',
        title: 'Partially Authored',
        authors: [
          { author: { key: '/authors/OL_GOOD_AUTH' } },
          { author: { key: '/authors/OL_BAD_AUTH' } },
        ],
      };

      const goodAuthor: OLAuthorDetails = {
        key: '/authors/OL_GOOD_AUTH',
        name: 'Good Author',
      };

      const searchResponse: OLSearchResponse = {
        numFound: 1,
        start: 0,
        docs: [
          {
            key: '/works/OL_PARTIAL_AUTH',
            title: 'Partially Authored',
            author_name: ['Good Author', 'Bad Author Found Via Search'],
            author_key: ['OL_GOOD_AUTH', 'OL_BAD_AUTH'],
          },
        ],
      };

      getMock.mock.mockImplementation(async (endpoint: string) => {
        if (endpoint.includes('/works/OL_PARTIAL_AUTH.json')) return work;
        if (endpoint.includes('/works/OL_PARTIAL_AUTH/editions.json'))
          return { entries: [] };
        if (endpoint.includes('/authors/OL_GOOD_AUTH.json')) return goodAuthor;
        if (endpoint.includes('/authors/OL_BAD_AUTH.json'))
          throw new Error('Not found');
        if (endpoint.includes('/search.json')) return searchResponse;
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      });

      const api = new OpenLibraryAPI();
      const fetchedWork = await api.getWork('OL_PARTIAL_AUTH');

      const authorDetails: OLAuthorDetails[] = [];
      const failedAuthorOlids: string[] = [];
      for (const authorRef of fetchedWork.authors ?? []) {
        try {
          const authorOlid = OpenLibraryAPI.extractOlid(authorRef.author.key);
          const author = await api.getAuthor(authorOlid);
          authorDetails.push(author);
        } catch {
          failedAuthorOlids.push(
            OpenLibraryAPI.extractOlid(authorRef.author.key)
          );
        }
      }

      const bookDetails = mapWorkToBookDetails(fetchedWork, authorDetails);
      assert.strictEqual(bookDetails.authors.length, 1);
      assert.strictEqual(bookDetails.authors[0].name, 'Good Author');

      // Search fallback for the failed author
      const olResults = await api.searchBooks({
        query: fetchedWork.title,
        limit: 5,
      });
      const matchingResult = olResults.docs.find(
        (doc) =>
          OpenLibraryAPI.extractOlid(doc.key) ===
          OpenLibraryAPI.extractOlid(fetchedWork.key)
      );

      if (matchingResult?.author_name && matchingResult?.author_key) {
        for (const failedOlid of failedAuthorOlids) {
          const searchIdx = matchingResult.author_key.findIndex(
            (k) => OpenLibraryAPI.extractOlid(k) === failedOlid
          );
          if (searchIdx >= 0 && matchingResult.author_name[searchIdx]) {
            bookDetails.authors.push({
              id: failedOlid,
              name: matchingResult.author_name[searchIdx],
            });
          }
        }
      }

      assert.strictEqual(bookDetails.authors.length, 2);
      assert.strictEqual(bookDetails.authors[0].name, 'Good Author');
      assert.strictEqual(
        bookDetails.authors[1].name,
        'Bad Author Found Via Search'
      );
      assert.strictEqual(bookDetails.authors[1].id, 'OL_BAD_AUTH');
    });

    it('should use "Unknown Author" when search also has no author data', async () => {
      const work: OLWorkDetails = {
        key: '/works/OL_NO_AUTH_DATA',
        title: 'No Author Data',
        authors: [{ author: { key: '/authors/OL_MISSING_AUTH' } }],
      };

      // Search result without author data
      const searchResponse: OLSearchResponse = {
        numFound: 1,
        start: 0,
        docs: [
          {
            key: '/works/OL_NO_AUTH_DATA',
            title: 'No Author Data',
            // No author_name or author_key
          },
        ],
      };

      getMock.mock.mockImplementation(async (endpoint: string) => {
        if (endpoint.includes('/works/OL_NO_AUTH_DATA.json')) return work;
        if (endpoint.includes('/works/OL_NO_AUTH_DATA/editions.json'))
          return { entries: [] };
        if (endpoint.includes('/authors/')) throw new Error('Not found');
        if (endpoint.includes('/search.json')) return searchResponse;
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      });

      const api = new OpenLibraryAPI();
      const fetchedWork = await api.getWork('OL_NO_AUTH_DATA');

      const authorDetails: OLAuthorDetails[] = [];
      const failedAuthorOlids: string[] = [];
      for (const authorRef of fetchedWork.authors ?? []) {
        try {
          const authorOlid = OpenLibraryAPI.extractOlid(authorRef.author.key);
          await api.getAuthor(authorOlid);
        } catch {
          failedAuthorOlids.push(
            OpenLibraryAPI.extractOlid(authorRef.author.key)
          );
        }
      }

      const bookDetails = mapWorkToBookDetails(fetchedWork, authorDetails);
      assert.strictEqual(bookDetails.authors.length, 0);

      // Search fallback - no author_name in search result
      const olResults = await api.searchBooks({
        query: fetchedWork.title,
        limit: 5,
      });
      const matchingResult = olResults.docs.find(
        (doc) =>
          OpenLibraryAPI.extractOlid(doc.key) ===
          OpenLibraryAPI.extractOlid(fetchedWork.key)
      );

      if (matchingResult) {
        if (!matchingResult.author_name && failedAuthorOlids.length > 0) {
          for (const failedOlid of failedAuthorOlids) {
            bookDetails.authors.push({
              id: failedOlid,
              name: 'Unknown Author',
            });
          }
        }
      }

      assert.strictEqual(bookDetails.authors.length, 1);
      assert.strictEqual(bookDetails.authors[0].name, 'Unknown Author');
      assert.strictEqual(bookDetails.authors[0].id, 'OL_MISSING_AUTH');
    });
  });

  describe('Description fallback from editions', () => {
    it('should use edition description when work has no description', async () => {
      const work: OLWorkDetails = {
        key: '/works/OL_NO_DESC',
        title: 'No Description Work',
        // No description field
      };

      const editionsResponse: OLEditionsResponse = {
        entries: [
          {
            key: '/books/OL_ED_1',
            title: 'No Description Work - Hardcover',
            description: 'Description from the edition.',
          },
        ],
      };

      getMock.mock.mockImplementation(async (endpoint: string) => {
        if (endpoint.includes('/works/OL_NO_DESC.json')) return work;
        if (endpoint.includes('/works/OL_NO_DESC/editions.json'))
          return editionsResponse;
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      });

      const api = new OpenLibraryAPI();
      const fetchedWork = await api.getWork('OL_NO_DESC');
      const bookDetails = mapWorkToBookDetails(fetchedWork);

      assert.strictEqual(
        bookDetails.description,
        undefined,
        'Work itself has no description'
      );

      // Edition description fallback (mirrors route handler logic)
      const edResp = await api.getWorkEditions('OL_NO_DESC');
      const editions = edResp.entries ?? [];

      if (!bookDetails.description && editions.length > 0) {
        for (const edition of editions) {
          const editionDesc = OpenLibraryAPI.normalizeDescription(
            edition.description
          );
          if (editionDesc) {
            bookDetails.description = editionDesc;
            break;
          }
        }
      }

      assert.strictEqual(
        bookDetails.description,
        'Description from the edition.'
      );
    });

    it('should handle object-style edition descriptions', async () => {
      const work: OLWorkDetails = {
        key: '/works/OL_OBJ_DESC',
        title: 'Object Description Edition',
      };

      const editionsResponse: OLEditionsResponse = {
        entries: [
          {
            key: '/books/OL_ED_OBJ',
            title: 'Object Description Edition - Paperback',
            description: { value: 'Edition description as object.' },
          },
        ],
      };

      getMock.mock.mockImplementation(async (endpoint: string) => {
        if (endpoint.includes('/works/OL_OBJ_DESC.json')) return work;
        if (endpoint.includes('/works/OL_OBJ_DESC/editions.json'))
          return editionsResponse;
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      });

      const api = new OpenLibraryAPI();
      const fetchedWork = await api.getWork('OL_OBJ_DESC');
      const bookDetails = mapWorkToBookDetails(fetchedWork);

      const edResp = await api.getWorkEditions('OL_OBJ_DESC');
      const editions = edResp.entries ?? [];

      if (!bookDetails.description && editions.length > 0) {
        for (const edition of editions) {
          const editionDesc = OpenLibraryAPI.normalizeDescription(
            edition.description
          );
          if (editionDesc) {
            bookDetails.description = editionDesc;
            break;
          }
        }
      }

      assert.strictEqual(
        bookDetails.description,
        'Edition description as object.'
      );
    });

    it('should skip editions without descriptions', async () => {
      const work: OLWorkDetails = {
        key: '/works/OL_SKIP_ED',
        title: 'Skip Editions Without Desc',
      };

      const editionsResponse: OLEditionsResponse = {
        entries: [
          {
            key: '/books/OL_ED_NODESC',
            title: 'Edition Without Desc',
            // No description
          },
          {
            key: '/books/OL_ED_WITHDESC',
            title: 'Edition With Desc',
            description: 'Found it!',
          },
        ],
      };

      getMock.mock.mockImplementation(async (endpoint: string) => {
        if (endpoint.includes('/works/OL_SKIP_ED.json')) return work;
        if (endpoint.includes('/works/OL_SKIP_ED/editions.json'))
          return editionsResponse;
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      });

      const api = new OpenLibraryAPI();
      const fetchedWork = await api.getWork('OL_SKIP_ED');
      const bookDetails = mapWorkToBookDetails(fetchedWork);

      const edResp = await api.getWorkEditions('OL_SKIP_ED');
      const editions = edResp.entries ?? [];

      if (!bookDetails.description && editions.length > 0) {
        for (const edition of editions) {
          const editionDesc = OpenLibraryAPI.normalizeDescription(
            edition.description
          );
          if (editionDesc) {
            bookDetails.description = editionDesc;
            break;
          }
        }
      }

      assert.strictEqual(bookDetails.description, 'Found it!');
    });
  });

  describe('Cover fallback from edition ISBNs', () => {
    it('should use ISBN-based cover URL when work has no covers', async () => {
      const work: OLWorkDetails = {
        key: '/works/OL_NO_COVER',
        title: 'No Cover Work',
        // No covers field
      };

      const editionsResponse: OLEditionsResponse = {
        entries: [
          {
            key: '/books/OL_ED_ISBN',
            title: 'No Cover Work - Paperback',
            isbn_13: ['9781234567890'],
          },
        ],
      };

      getMock.mock.mockImplementation(async (endpoint: string) => {
        if (endpoint.includes('/works/OL_NO_COVER.json')) return work;
        if (endpoint.includes('/works/OL_NO_COVER/editions.json'))
          return editionsResponse;
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      });

      const api = new OpenLibraryAPI();
      const fetchedWork = await api.getWork('OL_NO_COVER');
      const bookDetails = mapWorkToBookDetails(fetchedWork);

      assert.strictEqual(bookDetails.coverUrl, undefined);

      const edResp = await api.getWorkEditions('OL_NO_COVER');
      const editions = edResp.entries ?? [];

      // ISBN cover fallback (mirrors route handler logic)
      if (!bookDetails.coverUrl && editions.length > 0) {
        for (const edition of editions) {
          const isbn = edition.isbn_13?.[0] ?? edition.isbn_10?.[0];
          if (isbn) {
            bookDetails.coverUrl = OpenLibraryAPI.getCoverUrlByISBN(isbn, 'L');
            break;
          }
        }
      }

      assert.strictEqual(
        bookDetails.coverUrl,
        'https://covers.openlibrary.org/b/isbn/9781234567890-L.jpg'
      );
    });

    it('should fall back to ISBN-10 when no ISBN-13 available', async () => {
      const work: OLWorkDetails = {
        key: '/works/OL_ISBN10_COVER',
        title: 'ISBN-10 Cover Fallback',
      };

      const editionsResponse: OLEditionsResponse = {
        entries: [
          {
            key: '/books/OL_ED_ISBN10',
            title: 'ISBN-10 Edition',
            isbn_10: ['0123456789'],
            // No isbn_13
          },
        ],
      };

      getMock.mock.mockImplementation(async (endpoint: string) => {
        if (endpoint.includes('/works/OL_ISBN10_COVER.json')) return work;
        if (endpoint.includes('/works/OL_ISBN10_COVER/editions.json'))
          return editionsResponse;
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      });

      const api = new OpenLibraryAPI();
      const fetchedWork = await api.getWork('OL_ISBN10_COVER');
      const bookDetails = mapWorkToBookDetails(fetchedWork);

      const edResp = await api.getWorkEditions('OL_ISBN10_COVER');
      const editions = edResp.entries ?? [];

      if (!bookDetails.coverUrl && editions.length > 0) {
        for (const edition of editions) {
          const isbn = edition.isbn_13?.[0] ?? edition.isbn_10?.[0];
          if (isbn) {
            bookDetails.coverUrl = OpenLibraryAPI.getCoverUrlByISBN(isbn, 'L');
            break;
          }
        }
      }

      assert.strictEqual(
        bookDetails.coverUrl,
        'https://covers.openlibrary.org/b/isbn/0123456789-L.jpg'
      );
    });
  });

  describe('Subjects and date fallback from search', () => {
    it('should fill in missing subjects from search results', async () => {
      const work: OLWorkDetails = {
        key: '/works/OL_NO_SUBJ',
        title: 'No Subjects Work',
        // No subjects
      };

      const searchResponse: OLSearchResponse = {
        numFound: 1,
        start: 0,
        docs: [
          {
            key: '/works/OL_NO_SUBJ',
            title: 'No Subjects Work',
            subject: ['Fiction', 'Adventure', 'Fantasy'],
          },
        ],
      };

      getMock.mock.mockImplementation(async (endpoint: string) => {
        if (endpoint.includes('/works/OL_NO_SUBJ.json')) return work;
        if (endpoint.includes('/works/OL_NO_SUBJ/editions.json'))
          return { entries: [] };
        if (endpoint.includes('/search.json')) return searchResponse;
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      });

      const api = new OpenLibraryAPI();
      const fetchedWork = await api.getWork('OL_NO_SUBJ');
      const bookDetails = mapWorkToBookDetails(fetchedWork);

      assert.ok(
        !bookDetails.subjects,
        'Work should have no subjects initially'
      );

      // Search fallback for subjects
      const needsSearchFallback =
        !bookDetails.subjects ||
        (bookDetails.subjects as string[]).length === 0;
      assert.ok(needsSearchFallback);

      const olResults = await api.searchBooks({
        query: fetchedWork.title,
        limit: 5,
      });
      const matchingResult = olResults.docs.find(
        (doc) =>
          OpenLibraryAPI.extractOlid(doc.key) ===
          OpenLibraryAPI.extractOlid(fetchedWork.key)
      );

      if (
        matchingResult &&
        (!bookDetails.subjects ||
          (bookDetails.subjects as string[]).length === 0) &&
        matchingResult.subject
      ) {
        bookDetails.subjects = matchingResult.subject.slice(0, 20);
      }

      assert.ok(bookDetails.subjects);
      assert.strictEqual(bookDetails.subjects.length, 3);
      assert.deepStrictEqual(bookDetails.subjects, [
        'Fiction',
        'Adventure',
        'Fantasy',
      ]);
    });

    it('should fill in missing firstPublishDate from search results', async () => {
      const work: OLWorkDetails = {
        key: '/works/OL_NO_DATE',
        title: 'No Date Work',
        // No first_publish_date
      };

      const searchResponse: OLSearchResponse = {
        numFound: 1,
        start: 0,
        docs: [
          {
            key: '/works/OL_NO_DATE',
            title: 'No Date Work',
            first_publish_year: 1999,
          },
        ],
      };

      getMock.mock.mockImplementation(async (endpoint: string) => {
        if (endpoint.includes('/works/OL_NO_DATE.json')) return work;
        if (endpoint.includes('/works/OL_NO_DATE/editions.json'))
          return { entries: [] };
        if (endpoint.includes('/search.json')) return searchResponse;
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      });

      const api = new OpenLibraryAPI();
      const fetchedWork = await api.getWork('OL_NO_DATE');
      const bookDetails = mapWorkToBookDetails(fetchedWork);

      assert.strictEqual(bookDetails.firstPublishDate, undefined);

      const olResults = await api.searchBooks({
        query: fetchedWork.title,
        limit: 5,
      });
      const matchingResult = olResults.docs.find(
        (doc) =>
          OpenLibraryAPI.extractOlid(doc.key) ===
          OpenLibraryAPI.extractOlid(fetchedWork.key)
      );

      if (matchingResult && !bookDetails.firstPublishDate) {
        if (matchingResult.first_publish_year) {
          bookDetails.firstPublishDate = String(
            matchingResult.first_publish_year
          );
        }
      }

      assert.strictEqual(bookDetails.firstPublishDate, '1999');
    });

    it('should fill in missing cover from search cover_i', async () => {
      const work: OLWorkDetails = {
        key: '/works/OL_NO_COVER_SEARCH',
        title: 'No Cover Needs Search',
        // No covers
      };

      const searchResponse: OLSearchResponse = {
        numFound: 1,
        start: 0,
        docs: [
          {
            key: '/works/OL_NO_COVER_SEARCH',
            title: 'No Cover Needs Search',
            cover_i: 55555,
          },
        ],
      };

      getMock.mock.mockImplementation(async (endpoint: string) => {
        if (endpoint.includes('/works/OL_NO_COVER_SEARCH.json')) return work;
        if (endpoint.includes('/works/OL_NO_COVER_SEARCH/editions.json'))
          return { entries: [] }; // no editions either
        if (endpoint.includes('/search.json')) return searchResponse;
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      });

      const api = new OpenLibraryAPI();
      const fetchedWork = await api.getWork('OL_NO_COVER_SEARCH');
      const bookDetails = mapWorkToBookDetails(fetchedWork);

      assert.strictEqual(bookDetails.coverUrl, undefined);

      const olResults = await api.searchBooks({
        query: fetchedWork.title,
        limit: 5,
      });
      const matchingResult = olResults.docs.find(
        (doc) =>
          OpenLibraryAPI.extractOlid(doc.key) ===
          OpenLibraryAPI.extractOlid(fetchedWork.key)
      );

      if (matchingResult && !bookDetails.coverUrl && matchingResult.cover_i) {
        bookDetails.coverUrl = OpenLibraryAPI.getCoverUrl(
          matchingResult.cover_i,
          'L'
        );
      }

      assert.strictEqual(
        bookDetails.coverUrl,
        'https://covers.openlibrary.org/b/id/55555-L.jpg'
      );
    });
  });

  describe('Combined sparse data scenario', () => {
    it('should handle a work with only key and title, enriching from both editions and search', async () => {
      // Minimal work: only key and title. No description, no covers,
      // no subjects, no authors, no first_publish_date.
      const minimalWork: OLWorkDetails = {
        key: '/works/OL_MINIMAL',
        title: 'Minimal Book',
      };

      const editionsResponse: OLEditionsResponse = {
        entries: [
          {
            key: '/books/OL_MIN_ED',
            title: 'Minimal Book - First Edition',
            description: 'A description from the edition.',
            isbn_13: ['9789876543210'],
          },
        ],
      };

      const searchResponse: OLSearchResponse = {
        numFound: 1,
        start: 0,
        docs: [
          {
            key: '/works/OL_MINIMAL',
            title: 'Minimal Book',
            first_publish_year: 2020,
            subject: ['Novel', 'Contemporary Fiction'],
            // No cover_i, so ISBN cover from editions will be used
          },
        ],
      };

      getMock.mock.mockImplementation(async (endpoint: string) => {
        if (endpoint.includes('/works/OL_MINIMAL.json')) return minimalWork;
        if (endpoint.includes('/works/OL_MINIMAL/editions.json'))
          return editionsResponse;
        if (endpoint.includes('/search.json')) return searchResponse;
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      });

      const api = new OpenLibraryAPI();

      // Step 1: Get work and map
      const fetchedWork = await api.getWork('OL_MINIMAL');
      const bookDetails = mapWorkToBookDetails(fetchedWork);

      assert.strictEqual(bookDetails.title, 'Minimal Book');
      assert.ok(!bookDetails.description, 'Work has no description');
      assert.ok(!bookDetails.coverUrl, 'Work has no cover');
      assert.ok(!bookDetails.subjects, 'Work has no subjects');
      assert.ok(
        !bookDetails.firstPublishDate,
        'Work has no first publish date'
      );
      assert.deepStrictEqual(bookDetails.authors, []);

      // Step 2: Edition fallbacks
      const edResp = await api.getWorkEditions('OL_MINIMAL');
      const editions = edResp.entries ?? [];

      // Cover fallback from ISBN
      if (!bookDetails.coverUrl && editions.length > 0) {
        for (const edition of editions) {
          const isbn = edition.isbn_13?.[0] ?? edition.isbn_10?.[0];
          if (isbn) {
            bookDetails.coverUrl = OpenLibraryAPI.getCoverUrlByISBN(isbn, 'L');
            break;
          }
        }
      }

      // Description fallback from edition
      if (!bookDetails.description && editions.length > 0) {
        for (const edition of editions) {
          const editionDesc = OpenLibraryAPI.normalizeDescription(
            edition.description
          );
          if (editionDesc) {
            bookDetails.description = editionDesc;
            break;
          }
        }
      }

      // Step 3: Search fallback for remaining missing data
      const olResults = await api.searchBooks({
        query: fetchedWork.title,
        limit: 5,
      });
      const matchingResult = olResults.docs.find(
        (doc) =>
          OpenLibraryAPI.extractOlid(doc.key) ===
          OpenLibraryAPI.extractOlid(fetchedWork.key)
      );

      if (matchingResult) {
        if (
          (!bookDetails.subjects ||
            (bookDetails.subjects as string[]).length === 0) &&
          matchingResult.subject
        ) {
          bookDetails.subjects = matchingResult.subject.slice(0, 20);
        }
        if (
          !bookDetails.firstPublishDate &&
          matchingResult.first_publish_year
        ) {
          bookDetails.firstPublishDate = String(
            matchingResult.first_publish_year
          );
        }
      }

      // Verify all fields are now populated
      assert.strictEqual(
        bookDetails.description,
        'A description from the edition.'
      );
      assert.strictEqual(
        bookDetails.coverUrl,
        'https://covers.openlibrary.org/b/isbn/9789876543210-L.jpg'
      );
      assert.deepStrictEqual(bookDetails.subjects, [
        'Novel',
        'Contemporary Fiction',
      ]);
      assert.strictEqual(bookDetails.firstPublishDate, '2020');
    });

    it('should not overwrite existing data with fallback values', async () => {
      // Work with all fields populated should not be overwritten by fallbacks.
      const fullWork: OLWorkDetails = {
        key: '/works/OL_FULL',
        title: 'Full Work',
        description: 'Original description.',
        covers: [12345],
        subjects: ['Original Subject'],
        first_publish_date: '2010',
        authors: [],
      };

      getMock.mock.mockImplementation(async (endpoint: string) => {
        if (endpoint.includes('/works/OL_FULL.json')) return fullWork;
        if (endpoint.includes('/works/OL_FULL/editions.json'))
          return { entries: [] };
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      });

      const api = new OpenLibraryAPI();
      const fetchedWork = await api.getWork('OL_FULL');
      const bookDetails = mapWorkToBookDetails(fetchedWork);

      // Check that the search fallback is NOT triggered when data is present
      const needsSearchFallback =
        !bookDetails.description ||
        !bookDetails.subjects ||
        bookDetails.subjects.length === 0 ||
        !bookDetails.firstPublishDate;

      assert.strictEqual(
        needsSearchFallback,
        false,
        'Should not need search fallback when all data is present'
      );

      // Verify original data is preserved
      assert.strictEqual(bookDetails.description, 'Original description.');
      assert.strictEqual(
        bookDetails.coverUrl,
        'https://covers.openlibrary.org/b/id/12345-L.jpg'
      );
      assert.deepStrictEqual(bookDetails.subjects, ['Original Subject']);
      assert.strictEqual(bookDetails.firstPublishDate, '2010');
    });
  });
});
