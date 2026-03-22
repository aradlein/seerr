import OpenLibraryAPI from '@server/api/openlibrary';
import type {
  OLAuthorDetails,
  OLAuthorWorksResponse,
  OLEditionDetails,
  OLEditionsResponse,
  OLSearchResponse,
  OLWorkDetails,
} from '@server/api/openlibrary/interfaces';
import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

// ---------------------------------------------------------------------------
// Static / pure-function tests — no HTTP needed
// ---------------------------------------------------------------------------

describe('OpenLibraryAPI.getCoverUrl', () => {
  it('builds the correct URL with default size M', () => {
    const url = OpenLibraryAPI.getCoverUrl(12345);
    assert.strictEqual(url, 'https://covers.openlibrary.org/b/id/12345-M.jpg');
  });

  it('builds the correct URL for size S', () => {
    const url = OpenLibraryAPI.getCoverUrl(99, 'S');
    assert.strictEqual(url, 'https://covers.openlibrary.org/b/id/99-S.jpg');
  });

  it('builds the correct URL for size L', () => {
    const url = OpenLibraryAPI.getCoverUrl(7777, 'L');
    assert.strictEqual(url, 'https://covers.openlibrary.org/b/id/7777-L.jpg');
  });
});

describe('OpenLibraryAPI.getCoverUrlByISBN', () => {
  it('builds the correct URL with default size M', () => {
    const url = OpenLibraryAPI.getCoverUrlByISBN('9780451524935');
    assert.strictEqual(
      url,
      'https://covers.openlibrary.org/b/isbn/9780451524935-M.jpg'
    );
  });

  it('builds the correct URL for size S', () => {
    const url = OpenLibraryAPI.getCoverUrlByISBN('9780451524935', 'S');
    assert.strictEqual(
      url,
      'https://covers.openlibrary.org/b/isbn/9780451524935-S.jpg'
    );
  });

  it('builds the correct URL for size L', () => {
    const url = OpenLibraryAPI.getCoverUrlByISBN('9780451524935', 'L');
    assert.strictEqual(
      url,
      'https://covers.openlibrary.org/b/isbn/9780451524935-L.jpg'
    );
  });
});

describe('OpenLibraryAPI.getAuthorPhotoUrl', () => {
  it('builds the correct URL with default size M', () => {
    const url = OpenLibraryAPI.getAuthorPhotoUrl('OL34184A');
    assert.strictEqual(
      url,
      'https://covers.openlibrary.org/a/olid/OL34184A-M.jpg'
    );
  });

  it('builds the correct URL for size S', () => {
    const url = OpenLibraryAPI.getAuthorPhotoUrl('OL34184A', 'S');
    assert.strictEqual(
      url,
      'https://covers.openlibrary.org/a/olid/OL34184A-S.jpg'
    );
  });

  it('builds the correct URL for size L', () => {
    const url = OpenLibraryAPI.getAuthorPhotoUrl('OL34184A', 'L');
    assert.strictEqual(
      url,
      'https://covers.openlibrary.org/a/olid/OL34184A-L.jpg'
    );
  });
});

describe('OpenLibraryAPI.normalizeDescription', () => {
  it('returns undefined when description is undefined', () => {
    assert.strictEqual(
      OpenLibraryAPI.normalizeDescription(undefined),
      undefined
    );
  });

  it('returns undefined when description is empty string', () => {
    assert.strictEqual(OpenLibraryAPI.normalizeDescription(''), undefined);
  });

  it('returns string directly when description is a plain string', () => {
    assert.strictEqual(
      OpenLibraryAPI.normalizeDescription('A great book about adventures.'),
      'A great book about adventures.'
    );
  });

  it('extracts value when description is an object with value field', () => {
    assert.strictEqual(
      OpenLibraryAPI.normalizeDescription({
        value: 'A great book about adventures.',
      }),
      'A great book about adventures.'
    );
  });
});

describe('OpenLibraryAPI.extractOlid', () => {
  it('extracts OLID from a works key path', () => {
    assert.strictEqual(
      OpenLibraryAPI.extractOlid('/works/OL45804W'),
      'OL45804W'
    );
  });

  it('extracts OLID from an authors key path', () => {
    assert.strictEqual(
      OpenLibraryAPI.extractOlid('/authors/OL34184A'),
      'OL34184A'
    );
  });

  it('extracts OLID from a books key path', () => {
    assert.strictEqual(
      OpenLibraryAPI.extractOlid('/books/OL7353617M'),
      'OL7353617M'
    );
  });

  it('returns the input unchanged when there is no slash', () => {
    assert.strictEqual(OpenLibraryAPI.extractOlid('OL45804W'), 'OL45804W');
  });

  it('handles deeply nested paths by returning the last segment', () => {
    assert.strictEqual(
      OpenLibraryAPI.extractOlid('/type/author_role/OL123A'),
      'OL123A'
    );
  });
});

// ---------------------------------------------------------------------------
// Instance method tests — mock the inherited `get` method via prototype
// ---------------------------------------------------------------------------

describe('OpenLibraryAPI instance methods', () => {
  let api: OpenLibraryAPI;
  let getMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    api = new OpenLibraryAPI();
    // Mock the protected `get` method on the prototype chain.
    // Because `get` is defined on ExternalAPI (the superclass), we access
    // it through the instance's prototype chain and mock it.
    getMock = mock.method(
      Object.getPrototypeOf(Object.getPrototypeOf(api)),
      'get'
    );
  });

  describe('searchBooks', () => {
    it('returns mapped search results with correct shape', async () => {
      const fakeResponse: OLSearchResponse = {
        numFound: 1,
        start: 0,
        docs: [
          {
            key: '/works/OL45804W',
            title: 'Dune',
            author_name: ['Frank Herbert'],
            author_key: ['OL34184A'],
            first_publish_year: 1965,
            cover_i: 8226988,
            edition_count: 50,
            isbn: ['9780441172719'],
            subject: ['Science Fiction'],
            number_of_pages_median: 412,
            ratings_average: 4.2,
          },
        ],
      };
      getMock.mock.mockImplementation(async () => fakeResponse);

      const result = await api.searchBooks({ query: 'dune' });

      assert.strictEqual(result.numFound, 1);
      assert.strictEqual(result.docs.length, 1);
      assert.strictEqual(result.docs[0].title, 'Dune');
      assert.strictEqual(result.docs[0].key, '/works/OL45804W');
      assert.deepStrictEqual(result.docs[0].author_name, ['Frank Herbert']);
    });

    it('handles empty search results gracefully', async () => {
      const emptyResponse: OLSearchResponse = {
        numFound: 0,
        start: 0,
        docs: [],
      };
      getMock.mock.mockImplementation(async () => emptyResponse);

      const result = await api.searchBooks({ query: 'xyznonexistent' });

      assert.strictEqual(result.numFound, 0);
      assert.strictEqual(result.docs.length, 0);
    });

    it('passes correct parameters to the get method', async () => {
      const fakeResponse: OLSearchResponse = {
        numFound: 0,
        start: 0,
        docs: [],
      };
      getMock.mock.mockImplementation(async () => fakeResponse);

      await api.searchBooks({ query: 'test query', page: 2, limit: 10 });

      const call = getMock.mock.calls[0];
      assert.strictEqual(call.arguments[0], '/search.json');
      const params = (call.arguments[1] as Record<string, unknown>)
        ?.params as Record<string, unknown>;
      assert.strictEqual(params.q, 'test query');
      assert.strictEqual(params.limit, 10);
      assert.strictEqual(params.offset, 10); // (page 2 - 1) * limit 10
    });

    it('uses default page=1 and limit=20 when not provided', async () => {
      const fakeResponse: OLSearchResponse = {
        numFound: 0,
        start: 0,
        docs: [],
      };
      getMock.mock.mockImplementation(async () => fakeResponse);

      await api.searchBooks({ query: 'test' });

      const call = getMock.mock.calls[0];
      const params = (call.arguments[1] as Record<string, unknown>)
        ?.params as Record<string, unknown>;
      assert.strictEqual(params.limit, 20);
      assert.strictEqual(params.offset, 0);
    });
  });

  describe('getWork', () => {
    it('fetches work details from the correct endpoint', async () => {
      const fakeWork: OLWorkDetails = {
        key: '/works/OL45804W',
        title: 'Dune',
        description: 'A science fiction novel',
        covers: [8226988],
        subjects: ['Science Fiction', 'Space Opera'],
        authors: [
          {
            author: { key: '/authors/OL34184A' },
            type: { key: '/type/author_role' },
          },
        ],
        first_publish_date: '1965',
      };
      getMock.mock.mockImplementation(async () => fakeWork);

      const result = await api.getWork('OL45804W');

      assert.strictEqual(result.title, 'Dune');
      assert.strictEqual(result.key, '/works/OL45804W');
      assert.strictEqual(
        getMock.mock.calls[0].arguments[0],
        '/works/OL45804W.json'
      );
    });
  });

  describe('getEdition', () => {
    it('fetches edition details from the correct endpoint', async () => {
      const fakeEdition: OLEditionDetails = {
        key: '/books/OL7353617M',
        title: 'Dune',
        isbn_13: ['9780441172719'],
        publishers: ['Ace Books'],
        publish_date: 'June 2005',
        number_of_pages: 528,
        physical_format: 'Paperback',
      };
      getMock.mock.mockImplementation(async () => fakeEdition);

      const result = await api.getEdition('OL7353617M');

      assert.strictEqual(result.title, 'Dune');
      assert.strictEqual(
        getMock.mock.calls[0].arguments[0],
        '/books/OL7353617M.json'
      );
    });
  });

  describe('getEditionByISBN', () => {
    it('fetches edition details by ISBN from the correct endpoint', async () => {
      const fakeEdition: OLEditionDetails = {
        key: '/books/OL7353617M',
        title: 'Dune',
        isbn_13: ['9780441172719'],
      };
      getMock.mock.mockImplementation(async () => fakeEdition);

      const result = await api.getEditionByISBN('9780441172719');

      assert.strictEqual(result.title, 'Dune');
      assert.strictEqual(
        getMock.mock.calls[0].arguments[0],
        '/isbn/9780441172719.json'
      );
    });
  });

  describe('getWorkEditions', () => {
    it('fetches editions for a work from the correct endpoint', async () => {
      const fakeEditions: OLEditionsResponse = {
        entries: [
          {
            key: '/books/OL7353617M',
            title: 'Dune',
            isbn_13: ['9780441172719'],
          },
        ],
      };
      getMock.mock.mockImplementation(async () => fakeEditions);

      const result = await api.getWorkEditions('OL45804W');

      assert.strictEqual(result.entries.length, 1);
      assert.strictEqual(
        getMock.mock.calls[0].arguments[0],
        '/works/OL45804W/editions.json'
      );
    });
  });

  describe('getAuthor', () => {
    it('fetches author details from the correct endpoint', async () => {
      const fakeAuthor: OLAuthorDetails = {
        key: '/authors/OL34184A',
        name: 'Frank Herbert',
        bio: 'American science fiction writer',
        birth_date: '8 October 1920',
        death_date: '11 February 1986',
        photos: [6257017],
      };
      getMock.mock.mockImplementation(async () => fakeAuthor);

      const result = await api.getAuthor('OL34184A');

      assert.strictEqual(result.name, 'Frank Herbert');
      assert.strictEqual(
        getMock.mock.calls[0].arguments[0],
        '/authors/OL34184A.json'
      );
    });
  });

  describe('getAuthorWorks', () => {
    it('fetches author works from the correct endpoint with defaults', async () => {
      const fakeWorks: OLAuthorWorksResponse = {
        size: 42,
        entries: [
          {
            key: '/works/OL45804W',
            title: 'Dune',
          },
        ],
      };
      getMock.mock.mockImplementation(async () => fakeWorks);

      const result = await api.getAuthorWorks('OL34184A');

      assert.strictEqual(result.size, 42);
      assert.strictEqual(result.entries.length, 1);
      assert.strictEqual(
        getMock.mock.calls[0].arguments[0],
        '/authors/OL34184A/works.json'
      );
      const params = (
        getMock.mock.calls[0].arguments[1] as Record<string, unknown>
      )?.params as Record<string, unknown>;
      assert.strictEqual(params.limit, 20);
      assert.strictEqual(params.offset, 0);
    });

    it('passes custom limit and offset parameters', async () => {
      const fakeWorks: OLAuthorWorksResponse = {
        size: 42,
        entries: [],
      };
      getMock.mock.mockImplementation(async () => fakeWorks);

      await api.getAuthorWorks('OL34184A', { limit: 5, offset: 10 });

      const params = (
        getMock.mock.calls[0].arguments[1] as Record<string, unknown>
      )?.params as Record<string, unknown>;
      assert.strictEqual(params.limit, 5);
      assert.strictEqual(params.offset, 10);
    });
  });
});
