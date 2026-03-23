import OpenLibraryAPI from '@server/api/openlibrary';
import type { OLAuthorDetails } from '@server/api/openlibrary/interfaces';
import Media from '@server/entity/Media';
import logger from '@server/logger';
import {
  mapEditionToBookEdition,
  mapSearchResultToBookResult,
  mapWorkToBookDetails,
} from '@server/models/Book';
import { Router } from 'express';

const bookRoutes = Router();

bookRoutes.get('/:id', async (req, res, next) => {
  const openLibrary = new OpenLibraryAPI();

  try {
    const work = await openLibrary.getWork(req.params.id);

    // Resolve author details for each author reference in the work
    const authorDetails: OLAuthorDetails[] = [];
    if (work.authors) {
      for (const authorRef of work.authors) {
        try {
          const authorOlid = OpenLibraryAPI.extractOlid(authorRef.author.key);
          const author = await openLibrary.getAuthor(authorOlid);
          authorDetails.push(author);
        } catch {
          // Skip authors that fail to resolve
        }
      }
    }

    const bookDetails = mapWorkToBookDetails(work, authorDetails);

    // If work has no cover, try to find one via edition ISBN
    if (!bookDetails.coverUrl) {
      try {
        const editionsResponse = await openLibrary.getWorkEditions(
          req.params.id
        );
        const editions = editionsResponse.entries ?? [];
        // Find first edition with an ISBN
        for (const edition of editions) {
          const isbn = edition.isbn_13?.[0] ?? edition.isbn_10?.[0];
          if (isbn) {
            bookDetails.coverUrl = OpenLibraryAPI.getCoverUrlByISBN(isbn, 'L');
            break;
          }
        }
      } catch {
        // ISBN cover fallback is best-effort; continue without it
      }
    }

    // Check if a Media entity exists for this book
    const media = await Media.getMediaByOpenLibraryId(req.params.id);

    if (media) {
      return res.status(200).json({
        ...bookDetails,
        mediaInfo: {
          id: media.id,
          status: media.status,
          requests: media.requests,
        },
      });
    }

    return res.status(200).json(bookDetails);
  } catch (e) {
    logger.debug('Something went wrong retrieving book', {
      label: 'API',
      errorMessage: e.message,
      bookId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve book.',
    });
  }
});

bookRoutes.get('/:id/editions', async (req, res, next) => {
  const openLibrary = new OpenLibraryAPI();

  try {
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    const editionsResponse = await openLibrary.getWorkEditions(req.params.id);

    const allEditions = editionsResponse.entries ?? [];
    const paginatedEditions = allEditions.slice(offset, offset + limit);

    return res.status(200).json({
      totalResults: allEditions.length,
      limit,
      offset,
      results: paginatedEditions.map(mapEditionToBookEdition),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving book editions', {
      label: 'API',
      errorMessage: e.message,
      bookId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve book editions.',
    });
  }
});

bookRoutes.get('/:id/similar', async (req, res, next) => {
  const openLibrary = new OpenLibraryAPI();

  try {
    const work = await openLibrary.getWork(req.params.id);

    // Take first 3 subjects from the work for similarity search
    const subjects = (work.subjects ?? []).slice(0, 3);

    if (subjects.length === 0) {
      return res.status(200).json({
        totalResults: 0,
        results: [],
      });
    }

    const seenIds = new Set<string>();
    const currentWorkOlid = OpenLibraryAPI.extractOlid(work.key);
    seenIds.add(currentWorkOlid);

    const allResults: ReturnType<typeof mapSearchResultToBookResult>[] = [];

    for (const subject of subjects) {
      try {
        const searchResponse = await openLibrary.searchBooks({
          query: `subject:${subject}`,
          limit: 10,
        });

        for (const doc of searchResponse.docs) {
          const olid = OpenLibraryAPI.extractOlid(doc.key);
          if (!seenIds.has(olid)) {
            seenIds.add(olid);
            allResults.push(mapSearchResultToBookResult(doc));
          }
        }
      } catch {
        // Skip subjects that fail to search
      }
    }

    return res.status(200).json({
      totalResults: allResults.length,
      results: allResults.slice(0, 20),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving similar books', {
      label: 'API',
      errorMessage: e.message,
      bookId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve similar books.',
    });
  }
});

export default bookRoutes;
