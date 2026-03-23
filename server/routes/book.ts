import OpenLibraryAPI from '@server/api/openlibrary';
import type {
  OLAuthorDetails,
  OLEditionDetails,
} from '@server/api/openlibrary/interfaces';
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
    const failedAuthorOlids: string[] = [];
    if (work.authors) {
      for (const authorRef of work.authors) {
        try {
          const authorOlid = OpenLibraryAPI.extractOlid(authorRef.author.key);
          const author = await openLibrary.getAuthor(authorOlid);
          authorDetails.push(author);
        } catch {
          // Track failed author OLIDs so we can fill them from search
          const failedOlid = OpenLibraryAPI.extractOlid(authorRef.author.key);
          failedAuthorOlids.push(failedOlid);
        }
      }
    }

    const bookDetails = mapWorkToBookDetails(work, authorDetails);

    // Fetch editions for cover/description/ISBN fallbacks
    let editions: OLEditionDetails[] = [];
    try {
      const editionsResponse = await openLibrary.getWorkEditions(req.params.id);
      editions = editionsResponse.entries ?? [];
    } catch {
      // Editions fetch is best-effort
    }

    // Cover fallback: try to find a cover from edition ISBNs
    if (!bookDetails.coverUrl && editions.length > 0) {
      for (const edition of editions) {
        const isbn = edition.isbn_13?.[0] ?? edition.isbn_10?.[0];
        if (isbn) {
          bookDetails.coverUrl = OpenLibraryAPI.getCoverUrlByISBN(isbn, 'L');
          break;
        }
      }
    }

    // Description fallback: check editions for a description
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

    // If key fields are still missing, do a supplementary search query
    // to fill in data from the search index (which often has more metadata
    // than the work record itself, e.g. for newly-added books).
    const needsSearchFallback =
      !bookDetails.description ||
      !bookDetails.subjects ||
      bookDetails.subjects.length === 0 ||
      !bookDetails.firstPublishDate ||
      failedAuthorOlids.length > 0 ||
      (work.authors &&
        work.authors.length > 0 &&
        bookDetails.authors.length === 0);

    if (needsSearchFallback) {
      try {
        const searchResponse = await openLibrary.searchBooks({
          query: work.title,
          limit: 5,
        });

        // Find the matching search result by work key
        const workOlid = OpenLibraryAPI.extractOlid(work.key);
        const matchingResult = searchResponse.docs.find(
          (doc) => OpenLibraryAPI.extractOlid(doc.key) === workOlid
        );

        if (matchingResult) {
          // Fill in missing subjects from search
          if (
            (!bookDetails.subjects || bookDetails.subjects.length === 0) &&
            matchingResult.subject
          ) {
            bookDetails.subjects = matchingResult.subject.slice(0, 20);
          }

          // Fill in missing first publish date from search
          if (
            !bookDetails.firstPublishDate &&
            matchingResult.first_publish_year
          ) {
            bookDetails.firstPublishDate = String(
              matchingResult.first_publish_year
            );
          }

          // Fill in missing cover from search cover_i
          if (!bookDetails.coverUrl && matchingResult.cover_i) {
            bookDetails.coverUrl = OpenLibraryAPI.getCoverUrl(
              matchingResult.cover_i,
              'L'
            );
          }

          // Fill in failed author names from search results
          if (matchingResult.author_name && matchingResult.author_key) {
            // If we have zero resolved authors but search has them, use search
            if (bookDetails.authors.length === 0) {
              bookDetails.authors = matchingResult.author_name.map(
                (name, i) => ({
                  id: OpenLibraryAPI.extractOlid(
                    matchingResult.author_key?.[i] ?? ''
                  ),
                  name,
                })
              );
            } else if (failedAuthorOlids.length > 0) {
              // Fill in specific failed authors from search
              for (const failedOlid of failedAuthorOlids) {
                const searchIdx = matchingResult.author_key.findIndex(
                  (k) => OpenLibraryAPI.extractOlid(k) === failedOlid
                );
                if (searchIdx >= 0 && matchingResult.author_name[searchIdx]) {
                  bookDetails.authors.push({
                    id: failedOlid,
                    name: matchingResult.author_name[searchIdx],
                  });
                } else {
                  bookDetails.authors.push({
                    id: failedOlid,
                    name: 'Unknown Author',
                  });
                }
              }
            }
          } else if (failedAuthorOlids.length > 0) {
            // Search didn't have author data either, add placeholders
            for (const failedOlid of failedAuthorOlids) {
              bookDetails.authors.push({
                id: failedOlid,
                name: 'Unknown Author',
              });
            }
          }
        }
      } catch {
        // Search fallback is best-effort; continue with what we have
        logger.debug('Search fallback failed for sparse book data', {
          label: 'API',
          bookId: req.params.id,
        });
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
