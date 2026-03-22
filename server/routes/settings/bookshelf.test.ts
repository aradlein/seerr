import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';

import type { BookshelfSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import bookshelfRoutes from './bookshelf';

// ---------------------------------------------------------------------------
// Bookshelf settings route tests
//
// These tests exercise CRUD operations on the Bookshelf settings array
// via supertest. Auth is handled via API key header (admin), matching
// the pattern from auth.test.ts.
// ---------------------------------------------------------------------------

let app: Express;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use(checkUser);
  app.use('/settings/bookshelf', bookshelfRoutes);
  // Error handler matching the production error middleware
  app.use(
    (
      err: { status?: number | string; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      const status =
        typeof err.status === 'number' ? err.status : Number(err.status) || 500;
      res.status(status).json({ status, message: err.message });
    }
  );
  return app;
}

before(async () => {
  app = createApp();
});

setupTestDb();

/** Get an authenticated agent using API key */
function authenticatedRequest() {
  const settings = getSettings();
  return {
    get: (url: string) =>
      request(app).get(url).set('X-API-Key', settings.main.apiKey),
    post: (url: string) =>
      request(app).post(url).set('X-API-Key', settings.main.apiKey),
    put: (url: string) =>
      request(app).put(url).set('X-API-Key', settings.main.apiKey),
    delete: (url: string) =>
      request(app).delete(url).set('X-API-Key', settings.main.apiKey),
  };
}

const sampleBookshelfSettings: Partial<BookshelfSettings> = {
  name: 'Test Bookshelf',
  hostname: 'localhost',
  port: 8787,
  apiKey: 'test-api-key',
  useSsl: false,
  activeProfileId: 1,
  activeDirectory: '/books',
  isDefault: true,
  is4k: false,
  tags: [],
};

describe('GET /settings/bookshelf', () => {
  beforeEach(() => {
    const settings = getSettings();
    settings.bookshelf = [];
  });

  it('should return an empty array when no Bookshelf servers are configured', async () => {
    const auth = authenticatedRequest();
    const res = await auth.get('/settings/bookshelf');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, []);
  });

  it('should return configured Bookshelf servers', async () => {
    const settings = getSettings();
    settings.bookshelf = [
      { ...sampleBookshelfSettings, id: 0 } as BookshelfSettings,
    ];

    const auth = authenticatedRequest();
    const res = await auth.get('/settings/bookshelf');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].name, 'Test Bookshelf');
    assert.strictEqual(res.body[0].hostname, 'localhost');
    assert.strictEqual(res.body[0].port, 8787);
  });
});

describe('POST /settings/bookshelf', () => {
  beforeEach(() => {
    const settings = getSettings();
    settings.bookshelf = [];
  });

  it('should create a new Bookshelf instance and return 201', async () => {
    const auth = authenticatedRequest();
    const res = await auth
      .post('/settings/bookshelf')
      .send(sampleBookshelfSettings);

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.name, 'Test Bookshelf');
    assert.strictEqual(res.body.id, 0); // First item gets ID 0
    assert.strictEqual(res.body.isDefault, true);

    // Verify it was saved to settings
    const settings = getSettings();
    assert.strictEqual(settings.bookshelf.length, 1);
  });

  it('should assign incrementing IDs to new instances', async () => {
    const auth = authenticatedRequest();

    await auth.post('/settings/bookshelf').send({
      ...sampleBookshelfSettings,
      name: 'First',
    });

    const res = await auth.post('/settings/bookshelf').send({
      ...sampleBookshelfSettings,
      name: 'Second',
      isDefault: false,
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.id, 1); // Second item gets ID 1
    assert.strictEqual(res.body.name, 'Second');
  });

  it('should enforce single default (setting new default unsets previous)', async () => {
    const auth = authenticatedRequest();

    // Create first server as default
    await auth.post('/settings/bookshelf').send({
      ...sampleBookshelfSettings,
      name: 'First',
      isDefault: true,
    });

    // Create second server as default
    await auth.post('/settings/bookshelf').send({
      ...sampleBookshelfSettings,
      name: 'Second',
      isDefault: true,
    });

    // The first server's isDefault should now be false
    const settings = getSettings();
    const first = settings.bookshelf.find((b) => b.name === 'First');
    const second = settings.bookshelf.find((b) => b.name === 'Second');

    assert.ok(first);
    assert.ok(second);
    assert.strictEqual(first.isDefault, false);
    assert.strictEqual(second.isDefault, true);
  });
});

describe('PUT /settings/bookshelf/:id', () => {
  beforeEach(() => {
    const settings = getSettings();
    settings.bookshelf = [
      {
        ...sampleBookshelfSettings,
        id: 0,
        name: 'Original',
      } as BookshelfSettings,
    ];
  });

  it('should update an existing Bookshelf instance', async () => {
    const auth = authenticatedRequest();
    const res = await auth.put('/settings/bookshelf/0').send({
      ...sampleBookshelfSettings,
      name: 'Updated Bookshelf',
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.name, 'Updated Bookshelf');
    assert.strictEqual(res.body.id, 0); // ID should be preserved
  });

  it('should return 404 for nonexistent instance', async () => {
    const auth = authenticatedRequest();
    const res = await auth.put('/settings/bookshelf/999').send({
      ...sampleBookshelfSettings,
      name: 'Nonexistent',
    });

    assert.strictEqual(res.status, 404);
  });

  it('should enforce single default when updating to default', async () => {
    const settings = getSettings();
    settings.bookshelf = [
      {
        ...sampleBookshelfSettings,
        id: 0,
        name: 'First',
        isDefault: true,
      } as BookshelfSettings,
      {
        ...sampleBookshelfSettings,
        id: 1,
        name: 'Second',
        isDefault: false,
      } as BookshelfSettings,
    ];

    const auth = authenticatedRequest();
    await auth.put('/settings/bookshelf/1').send({
      ...sampleBookshelfSettings,
      name: 'Second',
      isDefault: true,
    });

    const updatedSettings = getSettings();
    const first = updatedSettings.bookshelf.find((b) => b.id === 0);
    const second = updatedSettings.bookshelf.find((b) => b.id === 1);

    assert.ok(first);
    assert.ok(second);
    assert.strictEqual(first.isDefault, false);
    assert.strictEqual(second.isDefault, true);
  });
});

describe('DELETE /settings/bookshelf/:id', () => {
  beforeEach(() => {
    const settings = getSettings();
    settings.bookshelf = [
      {
        ...sampleBookshelfSettings,
        id: 0,
        name: 'To Delete',
      } as BookshelfSettings,
    ];
  });

  it('should delete an existing Bookshelf instance', async () => {
    const auth = authenticatedRequest();
    const res = await auth.delete('/settings/bookshelf/0');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.name, 'To Delete');

    const settings = getSettings();
    assert.strictEqual(settings.bookshelf.length, 0);
  });

  it('should return 404 for nonexistent instance', async () => {
    const auth = authenticatedRequest();
    const res = await auth.delete('/settings/bookshelf/999');

    assert.strictEqual(res.status, 404);
  });

  it('should delete one instance without affecting others', async () => {
    const settings = getSettings();
    settings.bookshelf = [
      {
        ...sampleBookshelfSettings,
        id: 0,
        name: 'Keep',
      } as BookshelfSettings,
      {
        ...sampleBookshelfSettings,
        id: 1,
        name: 'Delete Me',
      } as BookshelfSettings,
    ];

    const auth = authenticatedRequest();
    await auth.delete('/settings/bookshelf/1');

    const updatedSettings = getSettings();
    assert.strictEqual(updatedSettings.bookshelf.length, 1);
    assert.strictEqual(updatedSettings.bookshelf[0].name, 'Keep');
  });
});

describe('POST /settings/bookshelf/test', () => {
  it('should return 500 when connection fails (bad credentials)', async () => {
    // The /test endpoint tries to connect to a real Bookshelf server,
    // which will fail in tests since no server is running.
    const auth = authenticatedRequest();
    const res = await auth.post('/settings/bookshelf/test').send({
      ...sampleBookshelfSettings,
      hostname: '127.0.0.1',
      port: 19999, // Port that nothing is listening on
      apiKey: 'bad-api-key',
    });

    assert.strictEqual(res.status, 500);
    assert.match(res.body.message, /failed to connect/i);
  });
});
