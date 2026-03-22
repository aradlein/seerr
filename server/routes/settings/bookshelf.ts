import BookshelfAPI from '@server/api/servarr/bookshelf';
import type { BookshelfSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const bookshelfRoutes = Router();

bookshelfRoutes.get('/', (_req, res) => {
  const settings = getSettings();

  res.status(200).json(settings.bookshelf);
});

bookshelfRoutes.post('/', async (req, res) => {
  const settings = getSettings();

  const newBookshelf = req.body as BookshelfSettings;
  const lastItem = settings.bookshelf[settings.bookshelf.length - 1];
  newBookshelf.id = lastItem ? lastItem.id + 1 : 0;

  // If we are setting this as the default, clear any previous defaults
  if (req.body.isDefault) {
    settings.bookshelf
      .filter((bookshelfInstance) => bookshelfInstance.is4k === req.body.is4k)
      .forEach((bookshelfInstance) => {
        bookshelfInstance.isDefault = false;
      });
  }

  settings.bookshelf = [...settings.bookshelf, newBookshelf];
  await settings.save();

  return res.status(201).json(newBookshelf);
});

bookshelfRoutes.post<
  undefined,
  Record<string, unknown>,
  BookshelfSettings & { tagLabel?: string }
>('/test', async (req, res, next) => {
  try {
    const bookshelf = new BookshelfAPI({
      apiKey: req.body.apiKey,
      url: BookshelfAPI.buildUrl(req.body, '/api/v1'),
    });

    const urlBase = await bookshelf
      .getSystemStatus()
      .then((value) => value.urlBase)
      .catch(() => req.body.baseUrl);
    const profiles = await bookshelf.getProfiles();
    const folders = await bookshelf.getRootFolders();
    const tags = await bookshelf.getTags();

    return res.status(200).json({
      profiles,
      rootFolders: folders.map((folder) => ({
        id: folder.id,
        path: folder.path,
      })),
      tags,
      urlBase,
    });
  } catch (e) {
    logger.error('Failed to test Bookshelf', {
      label: 'Bookshelf',
      message: e.message,
    });

    next({ status: 500, message: 'Failed to connect to Bookshelf' });
  }
});

bookshelfRoutes.put<{ id: string }, BookshelfSettings, BookshelfSettings>(
  '/:id',
  async (req, res, next) => {
    const settings = getSettings();

    const bookshelfIndex = settings.bookshelf.findIndex(
      (b) => b.id === Number(req.params.id)
    );

    if (bookshelfIndex === -1) {
      return next({ status: '404', message: 'Settings instance not found' });
    }

    // If we are setting this as the default, clear any previous defaults
    if (req.body.isDefault) {
      settings.bookshelf
        .filter((bookshelfInstance) => bookshelfInstance.is4k === req.body.is4k)
        .forEach((bookshelfInstance) => {
          bookshelfInstance.isDefault = false;
        });
    }

    settings.bookshelf[bookshelfIndex] = {
      ...req.body,
      id: Number(req.params.id),
    } as BookshelfSettings;
    await settings.save();

    return res.status(200).json(settings.bookshelf[bookshelfIndex]);
  }
);

bookshelfRoutes.get<{ id: string }>('/:id/profiles', async (req, res, next) => {
  const settings = getSettings();

  const bookshelfSettings = settings.bookshelf.find(
    (b) => b.id === Number(req.params.id)
  );

  if (!bookshelfSettings) {
    return next({ status: '404', message: 'Settings instance not found' });
  }

  const bookshelf = new BookshelfAPI({
    apiKey: bookshelfSettings.apiKey,
    url: BookshelfAPI.buildUrl(bookshelfSettings, '/api/v1'),
  });

  const profiles = await bookshelf.getProfiles();

  return res.status(200).json(
    profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
    }))
  );
});

bookshelfRoutes.delete<{ id: string }>('/:id', async (req, res, next) => {
  const settings = getSettings();

  const bookshelfIndex = settings.bookshelf.findIndex(
    (b) => b.id === Number(req.params.id)
  );

  if (bookshelfIndex === -1) {
    return next({ status: '404', message: 'Settings instance not found' });
  }

  const removed = settings.bookshelf.splice(bookshelfIndex, 1);
  await settings.save();

  return res.status(200).json(removed[0]);
});

export default bookshelfRoutes;
