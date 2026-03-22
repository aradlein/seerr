import OpenLibraryAPI from '@server/api/openlibrary';
import type { BookshelfBook } from '@server/api/servarr/bookshelf';
import BookshelfAPI from '@server/api/servarr/bookshelf';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

/**
 * Fulfills a book request by looking up the book in Bookshelf via ISBN
 * (or title+author fallback) and adding it for download.
 *
 * This is the book equivalent of the sendToRadarr/sendToSonarr flow
 * in MediaRequestSubscriber.
 */
export async function fulfillBookRequest(request: MediaRequest): Promise<void> {
  if (
    request.status !== MediaRequestStatus.APPROVED ||
    request.type !== MediaType.BOOK
  ) {
    return;
  }

  const settings = getSettings();
  const mediaRepository = getRepository(Media);

  const media = await mediaRepository.findOne({
    where: { id: request.media.id },
  });

  if (!media || !media.openLibraryId) {
    logger.error(
      'Media not found or missing openLibraryId for book fulfillment',
      {
        label: 'Book Fulfillment',
        requestId: request.id,
        mediaId: request.media.id,
      }
    );
    return;
  }

  if (settings.bookshelf.length === 0) {
    logger.info('No Bookshelf server configured, skipping request processing', {
      label: 'Book Fulfillment',
      requestId: request.id,
      mediaId: request.media.id,
    });
    return;
  }

  // Find the Bookshelf server to use
  let bookshelfServer =
    request.serverId !== null && request.serverId >= 0
      ? settings.bookshelf.find((s) => s.id === request.serverId)
      : undefined;

  if (!bookshelfServer) {
    bookshelfServer = settings.bookshelf.find((s) => s.isDefault);
  }

  if (!bookshelfServer) {
    logger.warn(
      'There is no default Bookshelf server configured. Did you set any of your Bookshelf servers as default?',
      {
        label: 'Book Fulfillment',
        requestId: request.id,
        mediaId: request.media.id,
      }
    );
    return;
  }

  if (media.status === MediaStatus.AVAILABLE) {
    logger.warn('Media already exists, marking request as COMPLETED', {
      label: 'Book Fulfillment',
      requestId: request.id,
      mediaId: request.media.id,
    });

    const requestRepository = getRepository(MediaRequest);
    request.status = MediaRequestStatus.COMPLETED;
    await requestRepository.save(request);
    return;
  }

  let rootFolder = bookshelfServer.activeDirectory;
  let qualityProfile = bookshelfServer.activeProfileId;
  let tags = bookshelfServer.tags ? [...bookshelfServer.tags] : [];

  if (
    request.rootFolder &&
    request.rootFolder !== '' &&
    request.rootFolder !== bookshelfServer.activeDirectory
  ) {
    rootFolder = request.rootFolder;
    logger.info(`Request has an override root folder: ${rootFolder}`, {
      label: 'Book Fulfillment',
      requestId: request.id,
      mediaId: request.media.id,
    });
  }

  if (
    request.profileId &&
    request.profileId !== bookshelfServer.activeProfileId
  ) {
    qualityProfile = request.profileId;
    logger.info(
      `Request has an override quality profile ID: ${qualityProfile}`,
      {
        label: 'Book Fulfillment',
        requestId: request.id,
        mediaId: request.media.id,
      }
    );
  }

  if (request.tags) {
    tags = request.tags;
    logger.info('Request has override tags', {
      label: 'Book Fulfillment',
      requestId: request.id,
      mediaId: request.media.id,
      tagIds: tags,
    });
  }

  const bookshelf = new BookshelfAPI({
    url: BookshelfAPI.buildUrl(bookshelfServer, '/api/v1'),
    apiKey: bookshelfServer.apiKey,
  });

  try {
    // Step 1: Get ISBN from Open Library editions
    const olApi = new OpenLibraryAPI();
    let isbn13: string | undefined;
    let bookTitle: string | undefined;
    let authorName: string | undefined;

    try {
      const work = await olApi.getWork(media.openLibraryId);
      bookTitle = work.title;

      // Get author name for fallback search
      if (work.authors?.[0]) {
        const authorOlid = OpenLibraryAPI.extractOlid(
          work.authors[0].author.key
        );
        const author = await olApi.getAuthor(authorOlid);
        authorName = author.name;
      }

      // Get editions to find best ISBN-13
      const editions = await olApi.getWorkEditions(media.openLibraryId);
      for (const edition of editions.entries ?? []) {
        if (edition.isbn_13?.[0]) {
          isbn13 = edition.isbn_13[0];
          break;
        }
      }
    } catch (e) {
      logger.warn('Failed to get OL data for ISBN lookup', {
        label: 'Book Fulfillment',
        openLibraryId: media.openLibraryId,
        errorMessage: e.message,
      });
    }

    // Step 2: Look up in Bookshelf (ISBN first, then title+author fallback)
    let matchedBook: BookshelfBook | undefined;

    if (isbn13) {
      const results = await bookshelf.lookupBook(isbn13);
      if (results.length > 0) {
        matchedBook = results[0];
        logger.info('Found book in Bookshelf by ISBN', {
          label: 'Book Fulfillment',
          isbn13,
          bookshelfTitle: matchedBook.title,
        });
      }
    }

    if (!matchedBook && bookTitle) {
      const searchTerm = authorName ? `${bookTitle} ${authorName}` : bookTitle;
      const results = await bookshelf.lookupBook(searchTerm);
      if (results.length > 0) {
        matchedBook = results[0];
        logger.info('Found book in Bookshelf by title+author search', {
          label: 'Book Fulfillment',
          searchTerm,
          bookshelfTitle: matchedBook.title,
        });
      }
    }

    if (!matchedBook) {
      logger.error('Book not found in Bookshelf — cannot fulfill request', {
        label: 'Book Fulfillment',
        openLibraryId: media.openLibraryId,
        isbn13,
        bookTitle,
      });
      // Update request status to FAILED
      const requestRepository = getRepository(MediaRequest);
      const freshRequest = await requestRepository.findOne({
        where: { id: request.id },
      });
      if (freshRequest && freshRequest.status !== MediaRequestStatus.FAILED) {
        freshRequest.status = MediaRequestStatus.FAILED;
        await requestRepository.save(freshRequest);
      }
      return;
    }

    // Step 3: Add book to Bookshelf (runs asynchronously like Radarr pattern)
    bookshelf
      .addBook({
        title: matchedBook.title,
        foreignBookId: matchedBook.foreignBookId,
        qualityProfileId: qualityProfile,
        rootFolderPath: rootFolder,
        monitored: true,
        searchNow: !bookshelfServer.preventSearch,
        tags,
      })
      .then(async (addedBook) => {
        // Re-fetch media to ensure we have the latest version
        const freshMedia = await mediaRepository.findOne({
          where: { id: request.media.id },
        });

        if (!freshMedia) {
          throw new Error('Media data not found');
        }

        freshMedia.externalServiceId = addedBook.id;
        freshMedia.externalServiceSlug = addedBook.titleSlug;
        freshMedia.serviceId = bookshelfServer?.id;

        // Store ISBN on the media entity for future reference
        if (isbn13 && !freshMedia.imdbId) {
          freshMedia.imdbId = isbn13;
        }

        await mediaRepository.save(freshMedia);

        logger.info('Book successfully sent to Bookshelf', {
          label: 'Book Fulfillment',
          bookshelfId: addedBook.id,
          bookshelfTitle: addedBook.title,
          openLibraryId: media.openLibraryId,
        });
      })
      .catch(async () => {
        try {
          const requestRepository = getRepository(MediaRequest);
          const freshRequest = await requestRepository.findOne({
            where: { id: request.id },
          });

          if (
            freshRequest &&
            freshRequest.status !== MediaRequestStatus.FAILED
          ) {
            freshRequest.status = MediaRequestStatus.FAILED;
            await requestRepository.save(freshRequest);
          }
        } catch (saveError) {
          logger.error('Failed to mark request as FAILED', {
            label: 'Book Fulfillment',
            requestId: request.id,
            errorMessage:
              saveError instanceof Error
                ? saveError.message
                : String(saveError),
          });
        }

        logger.warn(
          'Something went wrong sending book request to Bookshelf, marking status as FAILED',
          {
            label: 'Book Fulfillment',
            requestId: request.id,
            mediaId: request.media.id,
          }
        );
      })
      .finally(() => {
        bookshelf.clearCache({
          foreignBookId: matchedBook?.foreignBookId,
          externalId: media.externalServiceId,
        });
      });

    logger.info('Sent request to Bookshelf', {
      label: 'Book Fulfillment',
      requestId: request.id,
      mediaId: request.media.id,
    });
  } catch (e) {
    const requestRepository = getRepository(MediaRequest);
    const freshRequest = await requestRepository.findOne({
      where: { id: request.id },
    });

    if (freshRequest && freshRequest.status !== MediaRequestStatus.FAILED) {
      freshRequest.status = MediaRequestStatus.FAILED;
      await requestRepository.save(freshRequest);
    }

    logger.warn(
      'Failed to send book request to Bookshelf due to connection or configuration error, marking status as FAILED',
      {
        label: 'Book Fulfillment',
        requestId: request.id,
        mediaId: request.media.id,
        errorMessage: e.message,
      }
    );
  }
}
