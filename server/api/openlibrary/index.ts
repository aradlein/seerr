import ExternalAPI from '@server/api/externalapi';
import cacheManager from '@server/lib/cache';
import type {
  OLAuthorDetails,
  OLAuthorWorksResponse,
  OLEditionDetails,
  OLEditionsResponse,
  OLSearchResponse,
  OLWorkDetails,
} from './interfaces';

class OpenLibraryAPI extends ExternalAPI {
  constructor() {
    super(
      'https://openlibrary.org',
      {},
      {
        headers: {
          'User-Agent': 'Seerr/1.0 (https://github.com/seerr/seerr)',
        },
        nodeCache: cacheManager.getCache('openlibrary').data,
        rateLimit: {
          maxRPS: 3,
          maxRequests: 3,
        },
      }
    );
  }

  public async searchBooks(params: {
    query: string;
    page?: number;
    limit?: number;
  }): Promise<OLSearchResponse> {
    const limit = params.limit ?? 20;
    const page = params.page ?? 1;

    return this.get<OLSearchResponse>('/search.json', {
      params: {
        q: params.query,
        fields:
          'key,title,author_name,author_key,first_publish_year,cover_i,edition_count,isbn,subject,number_of_pages_median,ratings_average',
        limit,
        offset: (page - 1) * limit,
      },
    });
  }

  public async getWork(olid: string): Promise<OLWorkDetails> {
    return this.get<OLWorkDetails>(`/works/${olid}.json`);
  }

  public async getEdition(olid: string): Promise<OLEditionDetails> {
    return this.get<OLEditionDetails>(`/books/${olid}.json`);
  }

  public async getEditionByISBN(isbn: string): Promise<OLEditionDetails> {
    return this.get<OLEditionDetails>(`/isbn/${isbn}.json`);
  }

  public async getWorkEditions(olid: string): Promise<OLEditionsResponse> {
    return this.get<OLEditionsResponse>(`/works/${olid}/editions.json`);
  }

  public async getAuthor(olid: string): Promise<OLAuthorDetails> {
    return this.get<OLAuthorDetails>(`/authors/${olid}.json`);
  }

  public async getAuthorWorks(
    olid: string,
    params?: { limit?: number; offset?: number }
  ): Promise<OLAuthorWorksResponse> {
    return this.get<OLAuthorWorksResponse>(`/authors/${olid}/works.json`, {
      params: {
        limit: params?.limit ?? 20,
        offset: params?.offset ?? 0,
      },
    });
  }

  /**
   * Builds a cover image URL from a cover ID.
   * Uses the Open Library Covers API at covers.openlibrary.org.
   */
  public static getCoverUrl(
    coverId: number,
    size: 'S' | 'M' | 'L' = 'M'
  ): string {
    return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
  }

  /**
   * Builds a cover image URL from an ISBN.
   * Uses the Open Library Covers API at covers.openlibrary.org.
   */
  public static getCoverUrlByISBN(
    isbn: string,
    size: 'S' | 'M' | 'L' = 'M'
  ): string {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-${size}.jpg`;
  }

  /**
   * Builds an author photo URL from an author OLID.
   * Uses the Open Library Covers API at covers.openlibrary.org.
   */
  public static getAuthorPhotoUrl(
    olid: string,
    size: 'S' | 'M' | 'L' = 'M'
  ): string {
    return `https://covers.openlibrary.org/a/olid/${olid}-${size}.jpg`;
  }

  /**
   * Normalizes description from Open Library format.
   * OL descriptions can be either a plain string or an object with a `value` field.
   */
  public static normalizeDescription(
    description?: string | { value: string }
  ): string | undefined {
    if (!description) return undefined;
    if (typeof description === 'string') return description;
    return description.value;
  }

  /**
   * Extracts the OLID from an Open Library key string.
   * e.g., "/works/OL45804W" -> "OL45804W"
   * e.g., "/authors/OL34184A" -> "OL34184A"
   */
  public static extractOlid(key: string): string {
    return key.split('/').pop() ?? key;
  }
}

export default OpenLibraryAPI;
