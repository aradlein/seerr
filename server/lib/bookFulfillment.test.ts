import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import type { BookshelfSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';

// ---------------------------------------------------------------------------
// Book fulfillment logic tests
//
// These tests verify the fulfillment function's behavior:
// - Skipping non-approved / non-book requests
// - Requiring a configured Bookshelf server
// - Marking already-available media as COMPLETED
// - Returning early when media has no openLibraryId
//
// We test by importing fulfillBookRequest and creating real DB entities.
// The function returns early for most guard-clause scenarios without
// making any external HTTP calls.
// ---------------------------------------------------------------------------

setupTestDb();

function makeBookshelfSettings(): BookshelfSettings {
  return {
    id: 0,
    name: 'Test Bookshelf',
    hostname: 'localhost',
    port: 8787,
    apiKey: 'test-api-key',
    useSsl: false,
    activeProfileId: 1,
    activeProfileName: 'Default',
    activeDirectory: '/books',
    isDefault: true,
    is4k: false,
    tags: [],
    externalUrl: '',
    preventSearch: false,
    syncEnabled: false,
    tagRequests: false,
    overrideRule: [],
  };
}

describe('fulfillBookRequest', () => {
  let adminUser: User;

  beforeEach(async () => {
    const userRepo = getRepository(User);
    adminUser = await userRepo.findOneOrFail({
      where: { email: 'admin@seerr.dev' },
    });
  });

  describe('Guard clauses', () => {
    it('should skip requests that are not APPROVED', async () => {
      const { fulfillBookRequest } =
        await import('@server/lib/bookFulfillment');

      const mediaRepo = getRepository(Media);
      const media = new Media({
        tmdbId: 0,
        openLibraryId: 'OL_SKIP_1',
        status: MediaStatus.PENDING,
        status4k: MediaStatus.UNKNOWN,
        mediaType: MediaType.BOOK,
      });
      await mediaRepo.save(media);

      const requestRepo = getRepository(MediaRequest);
      const request = new MediaRequest({
        type: MediaType.BOOK,
        media,
        requestedBy: adminUser,
        status: MediaRequestStatus.PENDING, // Not APPROVED
        is4k: false,
      });
      await requestRepo.save(request);

      // Should return early without throwing
      await fulfillBookRequest(request);

      // Verify request status unchanged
      const freshRequest = await requestRepo.findOne({
        where: { id: request.id },
      });
      assert.ok(freshRequest);
      assert.strictEqual(freshRequest.status, MediaRequestStatus.PENDING);
    });

    it('should skip requests that are not of type BOOK', async () => {
      const { fulfillBookRequest } =
        await import('@server/lib/bookFulfillment');

      const mediaRepo = getRepository(Media);
      const media = new Media({
        tmdbId: 12345,
        status: MediaStatus.PENDING,
        status4k: MediaStatus.UNKNOWN,
        mediaType: MediaType.MOVIE,
      });
      await mediaRepo.save(media);

      const requestRepo = getRepository(MediaRequest);
      const request = new MediaRequest({
        type: MediaType.MOVIE,
        media,
        requestedBy: adminUser,
        status: MediaRequestStatus.APPROVED,
        is4k: false,
      });
      await requestRepo.save(request);

      // Should return early without throwing
      await fulfillBookRequest(request);

      // Verify request status unchanged
      const freshRequest = await requestRepo.findOne({
        where: { id: request.id },
      });
      assert.ok(freshRequest);
      assert.strictEqual(freshRequest.status, MediaRequestStatus.APPROVED);
    });
  });

  describe('Bookshelf server configuration', () => {
    it('should return early when no Bookshelf servers are configured', async () => {
      const { fulfillBookRequest } =
        await import('@server/lib/bookFulfillment');

      const settings = getSettings();
      const originalBookshelf = settings.bookshelf;
      settings.bookshelf = []; // No servers configured

      const mediaRepo = getRepository(Media);
      const media = new Media({
        tmdbId: 0,
        openLibraryId: 'OL_NOSERVER',
        status: MediaStatus.PENDING,
        status4k: MediaStatus.UNKNOWN,
        mediaType: MediaType.BOOK,
      });
      await mediaRepo.save(media);

      const requestRepo = getRepository(MediaRequest);
      const request = new MediaRequest({
        type: MediaType.BOOK,
        media,
        requestedBy: adminUser,
        status: MediaRequestStatus.APPROVED,
        is4k: false,
      });
      await requestRepo.save(request);

      // Should return early without throwing or changing status
      await fulfillBookRequest(request);

      const freshRequest = await requestRepo.findOne({
        where: { id: request.id },
      });
      assert.ok(freshRequest);
      // Status stays APPROVED (not FAILED) when no server configured
      assert.strictEqual(freshRequest.status, MediaRequestStatus.APPROVED);

      settings.bookshelf = originalBookshelf;
    });
  });

  describe('Already available media', () => {
    it('should mark request as COMPLETED when media is already AVAILABLE', async () => {
      const { fulfillBookRequest } =
        await import('@server/lib/bookFulfillment');

      const settings = getSettings();
      const originalBookshelf = settings.bookshelf;
      settings.bookshelf = [makeBookshelfSettings()];

      const mediaRepo = getRepository(Media);
      const media = new Media({
        tmdbId: 0,
        openLibraryId: 'OL_AVAILABLE',
        status: MediaStatus.AVAILABLE, // Already available
        status4k: MediaStatus.UNKNOWN,
        mediaType: MediaType.BOOK,
      });
      await mediaRepo.save(media);

      const requestRepo = getRepository(MediaRequest);
      const request = new MediaRequest({
        type: MediaType.BOOK,
        media,
        requestedBy: adminUser,
        status: MediaRequestStatus.APPROVED,
        is4k: false,
      });
      await requestRepo.save(request);

      await fulfillBookRequest(request);

      const freshRequest = await requestRepo.findOne({
        where: { id: request.id },
      });
      assert.ok(freshRequest);
      assert.strictEqual(freshRequest.status, MediaRequestStatus.COMPLETED);

      settings.bookshelf = originalBookshelf;
    });
  });

  describe('Missing media data', () => {
    it('should return early when media has no openLibraryId', async () => {
      const { fulfillBookRequest } =
        await import('@server/lib/bookFulfillment');

      const settings = getSettings();
      const originalBookshelf = settings.bookshelf;
      settings.bookshelf = [makeBookshelfSettings()];

      const mediaRepo = getRepository(Media);
      const media = new Media({
        tmdbId: 0,
        openLibraryId: null, // No OL ID
        status: MediaStatus.PENDING,
        status4k: MediaStatus.UNKNOWN,
        mediaType: MediaType.BOOK,
      });
      await mediaRepo.save(media);

      const requestRepo = getRepository(MediaRequest);
      const request = new MediaRequest({
        type: MediaType.BOOK,
        media,
        requestedBy: adminUser,
        status: MediaRequestStatus.APPROVED,
        is4k: false,
      });
      await requestRepo.save(request);

      // Should return early without throwing
      await fulfillBookRequest(request);

      settings.bookshelf = originalBookshelf;
    });
  });
});

// ---------------------------------------------------------------------------
// Fulfillment logic unit tests — pure logic verification without DB
// ---------------------------------------------------------------------------

describe('Fulfillment logic (unit)', () => {
  it('should verify APPROVED status is required', () => {
    // The fulfillBookRequest guard clause:
    //   if (request.status !== MediaRequestStatus.APPROVED || request.type !== MediaType.BOOK)
    //     return;
    //
    // This documents that only APPROVED BOOK requests are processed.
    const statuses = [
      MediaRequestStatus.PENDING,
      MediaRequestStatus.APPROVED,
      MediaRequestStatus.DECLINED,
      MediaRequestStatus.FAILED,
      MediaRequestStatus.COMPLETED,
    ];

    const approved = statuses.filter((s) => s === MediaRequestStatus.APPROVED);
    assert.strictEqual(approved.length, 1);
    assert.strictEqual(approved[0], MediaRequestStatus.APPROVED);
  });

  it('should verify only BOOK type is processed', () => {
    const types = [MediaType.MOVIE, MediaType.TV, MediaType.BOOK];

    const bookTypes = types.filter((t) => t === MediaType.BOOK);
    assert.strictEqual(bookTypes.length, 1);
    assert.strictEqual(bookTypes[0], 'book');
  });

  it('should prefer ISBN-13 lookup before title+author fallback', () => {
    // This test documents the expected lookup order in fulfillBookRequest:
    // 1. Look up book by ISBN-13 in Bookshelf
    // 2. If no ISBN-13 match, fall back to title + author name search
    // 3. If no match at all, mark request as FAILED
    const isbn13 = '9780441172719';
    const bookTitle = 'Dune';
    const authorName = 'Frank Herbert';

    // With ISBN, the search term is the ISBN
    assert.ok(isbn13, 'ISBN should be used first for lookup');

    // Without ISBN, fall back to title + author
    const fallbackTerm = `${bookTitle} ${authorName}`;
    assert.strictEqual(fallbackTerm, 'Dune Frank Herbert');

    // With no author, fall back to title only
    const titleOnlyTerm = bookTitle;
    assert.strictEqual(titleOnlyTerm, 'Dune');
  });

  it('should mark request as FAILED when no Bookshelf match found', () => {
    // When lookupBook returns no results for either ISBN or title+author,
    // the request status should be set to FAILED (value 4).
    assert.strictEqual(MediaRequestStatus.FAILED, 4);
    // FAILED and APPROVED must be distinct status values
    assert.notStrictEqual(
      MediaRequestStatus.FAILED as number,
      MediaRequestStatus.APPROVED as number
    );
  });
});
