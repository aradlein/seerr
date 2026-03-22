import OpenLibraryAPI from '@server/api/openlibrary';
import logger from '@server/logger';
import {
  mapAuthorToAuthorResult,
  mapWorkToBookDetails,
} from '@server/models/Book';
import { Router } from 'express';

const authorRoutes = Router();

authorRoutes.get('/:id', async (req, res, next) => {
  const openLibrary = new OpenLibraryAPI();

  try {
    const author = await openLibrary.getAuthor(req.params.id);
    const result = mapAuthorToAuthorResult(author);

    return res.status(200).json(result);
  } catch (e) {
    logger.debug('Something went wrong retrieving author', {
      label: 'API',
      errorMessage: e.message,
      authorId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve author.',
    });
  }
});

authorRoutes.get('/:id/works', async (req, res, next) => {
  const openLibrary = new OpenLibraryAPI();

  try {
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    const worksResponse = await openLibrary.getAuthorWorks(req.params.id, {
      limit,
      offset,
    });

    // Map the partial work objects from the author works endpoint
    const results = (worksResponse.entries ?? []).map((work) =>
      mapWorkToBookDetails(work)
    );

    return res.status(200).json({
      totalResults: worksResponse.size,
      limit,
      offset,
      results,
    });
  } catch (e) {
    logger.debug("Something went wrong retrieving author's works", {
      label: 'API',
      errorMessage: e.message,
      authorId: req.params.id,
    });
    return next({
      status: 500,
      message: "Unable to retrieve author's works.",
    });
  }
});

export default authorRoutes;
