import logger from '@server/logger';
import ServarrBase from './base';

// Bookshelf (Readarr) lookup endpoints call external metadata services
// (GoodReads) in real-time, which can be very slow (60-90+ seconds).
// We use a much longer timeout for these operations than the default.
const LOOKUP_TIMEOUT_MS = 120000;

export interface BookshelfBookOptions {
  title: string;
  qualityProfileId: number;
  rootFolderPath: string;
  foreignBookId: string; // Bookshelf's foreign ID (from lookup)
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

export interface BookshelfBook {
  id: number;
  title: string;
  foreignBookId: string;
  monitored: boolean;
  titleSlug: string;
  path: string;
  qualityProfileId: number;
  added: string;
  grabbed: boolean;
  bookFile?: {
    id: number;
    path: string;
    size: number;
    dateAdded: string;
  };
  author?: {
    id: number;
    authorName: string;
    foreignAuthorId: string;
  };
  tags: number[];
}

export interface BookshelfAuthor {
  id: number;
  authorName: string;
  foreignAuthorId: string;
  monitored: boolean;
  path: string;
}

export interface BookshelfSearchResult {
  foreignId: string;
  author: {
    authorName: string;
    foreignAuthorId: string;
    books?: BookshelfBook[];
  };
  id: number;
}

class BookshelfAPI extends ServarrBase<{ bookId: number }> {
  constructor({ url, apiKey }: { url: string; apiKey: string }) {
    super({ url, apiKey, cacheName: 'bookshelf', apiName: 'Bookshelf' });
  }

  public lookupBook = async (term: string): Promise<BookshelfBook[]> => {
    try {
      logger.info('Looking up book in Bookshelf (this may take a while)', {
        label: 'Bookshelf API',
        term,
      });

      const response = await this.axios.get<BookshelfBook[]>('/book/lookup', {
        params: { term },
        timeout: LOOKUP_TIMEOUT_MS,
      });

      return response.data;
    } catch (e) {
      logger.error('Error looking up book in Bookshelf', {
        label: 'Bookshelf API',
        errorMessage: e.message,
        term,
      });
      throw new Error(`[Bookshelf] Failed to lookup book: ${e.message}`, {
        cause: e,
      });
    }
  };

  public getBook = async ({ id }: { id: number }): Promise<BookshelfBook> => {
    try {
      const response = await this.axios.get<BookshelfBook>(`/book/${id}`);

      return response.data;
    } catch (e) {
      throw new Error(`[Bookshelf] Failed to retrieve book: ${e.message}`, {
        cause: e,
      });
    }
  };

  public getBooks = async (): Promise<BookshelfBook[]> => {
    try {
      const response = await this.axios.get<BookshelfBook[]>('/book');

      return response.data;
    } catch (e) {
      throw new Error(`[Bookshelf] Failed to retrieve books: ${e.message}`, {
        cause: e,
      });
    }
  };

  public addBook = async (
    options: BookshelfBookOptions
  ): Promise<BookshelfBook> => {
    try {
      // Step 1: Look up book by foreignBookId to see if it already exists
      const lookupResults = await this.lookupBook(options.foreignBookId);
      const existingBook = lookupResults.find(
        (b) => b.foreignBookId === options.foreignBookId
      );

      if (existingBook) {
        // Book already has a file — return it directly
        if (existingBook.bookFile) {
          logger.info(
            'Title already exists and is available. Skipping add and returning success',
            {
              label: 'Bookshelf',
              book: existingBook,
            }
          );
          return existingBook;
        }

        // Book exists but is not monitored — update it
        if (existingBook.id && !existingBook.monitored) {
          const response = await this.axios.put<BookshelfBook>('/book', {
            ...existingBook,
            title: options.title,
            qualityProfileId: options.qualityProfileId,
            rootFolderPath: options.rootFolderPath,
            monitored: options.monitored ?? true,
            tags: Array.from(
              new Set([...existingBook.tags, ...(options.tags ?? [])])
            ),
            addOptions: {
              searchForNewBook: options.searchNow,
            },
          });

          if (response.data.monitored) {
            logger.info(
              'Found existing title in Bookshelf and set it to monitored.',
              {
                label: 'Bookshelf',
                bookId: response.data.id,
                bookTitle: response.data.title,
              }
            );

            if (options.searchNow) {
              this.searchBook(response.data.id);
            }

            return response.data;
          } else {
            logger.error('Failed to update existing book in Bookshelf.', {
              label: 'Bookshelf',
              options,
            });
            throw new Error('Failed to update existing book in Bookshelf');
          }
        }

        if (existingBook.id) {
          // Book exists and is already monitored
          logger.info('Book is already monitored in Bookshelf.', {
            label: 'Bookshelf',
            bookId: existingBook.id,
            bookTitle: existingBook.title,
            hasFile: !!existingBook.bookFile,
          });

          // If searchNow is requested and book doesn't have a file, trigger search
          if (options.searchNow && !existingBook.bookFile) {
            logger.info(
              'Triggering search for existing monitored book without file',
              {
                label: 'Bookshelf',
                bookId: existingBook.id,
                bookTitle: existingBook.title,
              }
            );
            this.searchBook(existingBook.id);
          }

          return existingBook;
        }
      }

      // Step 2: Book doesn't exist — POST to add it
      const response = await this.axios.post<BookshelfBook>('/book', {
        title: options.title,
        foreignBookId: options.foreignBookId,
        qualityProfileId: options.qualityProfileId,
        rootFolderPath: options.rootFolderPath,
        monitored: options.monitored ?? true,
        tags: options.tags ?? [],
        addOptions: {
          searchForNewBook: options.searchNow,
        },
        ...(options.author
          ? {
              author: {
                foreignAuthorId: options.author.foreignAuthorId,
                qualityProfileId: options.author.qualityProfileId,
                rootFolderPath: options.author.rootFolderPath,
                monitored: options.author.monitored,
              },
            }
          : {}),
      });

      if (response.data.id) {
        logger.info('Bookshelf accepted request', { label: 'Bookshelf' });
        logger.debug('Bookshelf add details', {
          label: 'Bookshelf',
          book: response.data,
        });
      } else {
        logger.error('Failed to add book to Bookshelf', {
          label: 'Bookshelf',
          options,
        });
        throw new Error('Failed to add book to Bookshelf');
      }

      return response.data;
    } catch (e) {
      logger.error(
        'Failed to add book to Bookshelf. This might happen if the book already exists, in which case you can safely ignore this error.',
        {
          label: 'Bookshelf',
          errorMessage: e.message,
          options,
          response: e?.response?.data,
        }
      );
      throw new Error('Failed to add book to Bookshelf', { cause: e });
    }
  };

  public async searchBook(bookId: number): Promise<void> {
    logger.info('Executing book search command', {
      label: 'Bookshelf API',
      bookId,
    });

    try {
      await this.runCommand('BookSearch', { bookIds: [bookId] });
    } catch (e) {
      logger.error(
        'Something went wrong while executing Bookshelf book search.',
        {
          label: 'Bookshelf API',
          errorMessage: e.message,
          bookId,
        }
      );
    }
  }

  public removeBook = async (bookId: number): Promise<void> => {
    try {
      await this.axios.delete(`/book/${bookId}`, {
        params: {
          deleteFiles: true,
          addImportExclusion: false,
        },
      });
      logger.info(`[Bookshelf] Removed book with ID ${bookId}`);
    } catch (e) {
      throw new Error(`[Bookshelf] Failed to remove book: ${e.message}`, {
        cause: e,
      });
    }
  };

  public lookupAuthor = async (term: string): Promise<BookshelfAuthor[]> => {
    try {
      logger.info('Looking up author in Bookshelf (this may take a while)', {
        label: 'Bookshelf API',
        term,
      });

      const response = await this.axios.get<BookshelfAuthor[]>(
        '/author/lookup',
        {
          params: { term },
          timeout: LOOKUP_TIMEOUT_MS,
        }
      );

      return response.data;
    } catch (e) {
      logger.error('Error looking up author in Bookshelf', {
        label: 'Bookshelf API',
        errorMessage: e.message,
        term,
      });
      throw new Error(`[Bookshelf] Failed to lookup author: ${e.message}`, {
        cause: e,
      });
    }
  };

  /**
   * Uses the /search endpoint which is faster than /book/lookup because
   * it uses Bookshelf's internal search rather than calling GoodReads
   * for each result. Returns author-level results with books nested.
   */
  public searchAuthors = async (
    term: string
  ): Promise<BookshelfSearchResult[]> => {
    try {
      const response = await this.axios.get<BookshelfSearchResult[]>(
        '/search',
        {
          params: { term },
          timeout: LOOKUP_TIMEOUT_MS,
        }
      );

      return response.data;
    } catch (e) {
      logger.error('Error searching in Bookshelf', {
        label: 'Bookshelf API',
        errorMessage: e.message,
        term,
      });
      throw new Error(`[Bookshelf] Failed to search: ${e.message}`, {
        cause: e,
      });
    }
  };

  public clearCache = ({
    foreignBookId,
    externalId,
  }: {
    foreignBookId?: string | null;
    externalId?: number | null;
  }) => {
    if (foreignBookId) {
      this.removeCache('/book/lookup', {
        term: foreignBookId,
      });
    }
    if (externalId) {
      this.removeCache(`/book/${externalId}`);
    }
  };
}

export default BookshelfAPI;
