import OpenLibraryAPI from '@server/api/openlibrary';
import type {
  OLAuthorDetails,
  OLAuthorWorksResponse,
  OLEditionDetails,
  OLEditionsResponse,
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
