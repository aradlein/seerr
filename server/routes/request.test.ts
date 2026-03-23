import OpenLibraryAPI from '@server/api/openlibrary';
import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { setupTestDb } from '@server/test/db';

// ---------------------------------------------------------------------------
// Book request handling tests
//
// These tests exercise the MediaRequest.request() static method directly,
// which contains the core business logic for creating book requests.
// This avoids needing full supertest infrastructure with sessions/auth
// while still testing permissions, quotas, duplicates, and entity creation.
// ---------------------------------------------------------------------------

setupTestDb();

describe('Book request handling', () => {
  let adminUser: User;
  let regularUser: User;

  beforeEach(async () => {
    const userRepo = getRepository(User);

    adminUser = await userRepo.findOneOrFail({
      where: { email: 'admin@seerr.dev' },
    });

    regularUser = await userRepo.findOneOrFail({
      where: { email: 'friend@seerr.dev' },
    });
  });

  describe('Permission checks', () => {
    it('should require REQUEST_BOOK permission to make a book request', async () => {
      // Regular user (friend@seerr.dev) has permissions = 32 (REQUEST only).
      // REQUEST (32) satisfies the check:
      //   requestUser.hasPermission([Permission.REQUEST, Permission.REQUEST_BOOK], { type: 'or' })
      // So a user with REQUEST should be able to make book requests.
      // Let's create a user with NO request permission to test the rejection.
      const userRepo = getRepository(User);
      const noPermUser = new User();
      noPermUser.plexId = 999;
      noPermUser.plexToken = 'noperm';
      noPermUser.plexUsername = 'noperm';
      noPermUser.username = 'noperm';
      noPermUser.email = 'noperm@seerr.dev';
      noPermUser.permissions = Permission.NONE; // No permissions at all
      noPermUser.avatar =
        'https://gravatar.com/avatar/test?default=mm&size=200';
      await userRepo.save(noPermUser);

      await assert.rejects(
        async () => {
          await MediaRequest.request(
            {
              mediaType: MediaType.BOOK,
              mediaId: 0,
              openLibraryId: 'OL45804W',
            },
            noPermUser
          );
        },
        (error: Error) => {
          assert.match(error.message, /permission.*book/i);
          return true;
        }
      );
    });

    it('should allow a user with REQUEST permission to make book requests', async () => {
      // Regular user has permissions = 32 (REQUEST), which satisfies the OR check
      const request = await MediaRequest.request(
        {
          mediaType: MediaType.BOOK,
          mediaId: 0,
          openLibraryId: 'OL45804W',
        },
        regularUser
      );

      assert.ok(request);
      assert.strictEqual(request.type, MediaType.BOOK);
      assert.strictEqual(request.status, MediaRequestStatus.PENDING);
    });

    it('should allow a user with REQUEST_BOOK permission to make book requests', async () => {
      const userRepo = getRepository(User);
      const bookUser = new User();
      bookUser.plexId = 998;
      bookUser.plexToken = 'bookonly';
      bookUser.plexUsername = 'bookonly';
      bookUser.username = 'bookonly';
      bookUser.email = 'bookonly@seerr.dev';
      bookUser.permissions = Permission.REQUEST_BOOK;
      bookUser.avatar = 'https://gravatar.com/avatar/test?default=mm&size=200';
      await userRepo.save(bookUser);

      const request = await MediaRequest.request(
        {
          mediaType: MediaType.BOOK,
          mediaId: 0,
          openLibraryId: 'OL99999W',
        },
        bookUser
      );

      assert.ok(request);
      assert.strictEqual(request.type, MediaType.BOOK);
    });
  });

  describe('Media entity creation', () => {
    it('should create a Media entity with the correct openLibraryId and mediaType', async () => {
      const request = await MediaRequest.request(
        {
          mediaType: MediaType.BOOK,
          mediaId: 0,
          openLibraryId: 'OL11111W',
        },
        regularUser
      );

      assert.ok(request);
      assert.strictEqual(request.type, MediaType.BOOK);

      const mediaRepo = getRepository(Media);
      const media = await mediaRepo.findOne({
        where: {
          openLibraryId: 'OL11111W',
          mediaType: MediaType.BOOK,
        },
      });

      assert.ok(media, 'Media entity should exist');
      assert.strictEqual(media.openLibraryId, 'OL11111W');
      assert.strictEqual(media.mediaType, MediaType.BOOK);
      assert.strictEqual(media.tmdbId, 0); // Not used for books
      assert.strictEqual(media.status, MediaStatus.PENDING);
    });

    it('should require openLibraryId for book requests', async () => {
      await assert.rejects(
        async () => {
          await MediaRequest.request(
            {
              mediaType: MediaType.BOOK,
              mediaId: 0,
              // No openLibraryId
            },
            regularUser
          );
        },
        (error: Error) => {
          assert.match(error.message, /openLibraryId.*required/i);
          return true;
        }
      );
    });
  });

  describe('Duplicate request handling', () => {
    it('should reject a duplicate book request for the same openLibraryId', async () => {
      // First request should succeed
      await MediaRequest.request(
        {
          mediaType: MediaType.BOOK,
          mediaId: 0,
          openLibraryId: 'OL22222W',
        },
        regularUser
      );

      // Second request for the same book should be rejected
      await assert.rejects(
        async () => {
          await MediaRequest.request(
            {
              mediaType: MediaType.BOOK,
              mediaId: 0,
              openLibraryId: 'OL22222W',
            },
            regularUser
          );
        },
        (error: Error) => {
          assert.match(error.message, /already exists/i);
          return true;
        }
      );
    });

    it('should allow a new request after a previous request was declined', async () => {
      // Create and then decline a request
      const firstRequest = await MediaRequest.request(
        {
          mediaType: MediaType.BOOK,
          mediaId: 0,
          openLibraryId: 'OL33333W',
        },
        regularUser
      );

      const requestRepo = getRepository(MediaRequest);
      firstRequest.status = MediaRequestStatus.DECLINED;
      await requestRepo.save(firstRequest);

      // A new request for the same book should now be allowed
      const secondRequest = await MediaRequest.request(
        {
          mediaType: MediaType.BOOK,
          mediaId: 0,
          openLibraryId: 'OL33333W',
        },
        regularUser
      );

      assert.ok(secondRequest);
      assert.strictEqual(secondRequest.type, MediaType.BOOK);
    });
  });

  describe('Auto-approval', () => {
    it('should auto-approve when user has AUTO_APPROVE permission', async () => {
      // Admin has permissions = 2 (ADMIN), which is checked in the hasPermission
      // function and always returns true for admins.
      const request = await MediaRequest.request(
        {
          mediaType: MediaType.BOOK,
          mediaId: 0,
          openLibraryId: 'OL44444W',
        },
        adminUser
      );

      assert.strictEqual(request.status, MediaRequestStatus.APPROVED);
    });

    it('should auto-approve when user has AUTO_APPROVE_BOOK permission', async () => {
      const userRepo = getRepository(User);
      const autoApproveUser = new User();
      autoApproveUser.plexId = 997;
      autoApproveUser.plexToken = 'autoapprove';
      autoApproveUser.plexUsername = 'autoapprove';
      autoApproveUser.username = 'autoapprove';
      autoApproveUser.email = 'autoapprove@seerr.dev';
      autoApproveUser.permissions =
        Permission.REQUEST | Permission.AUTO_APPROVE_BOOK;
      autoApproveUser.avatar =
        'https://gravatar.com/avatar/test?default=mm&size=200';
      await userRepo.save(autoApproveUser);

      const request = await MediaRequest.request(
        {
          mediaType: MediaType.BOOK,
          mediaId: 0,
          openLibraryId: 'OL55555W',
        },
        autoApproveUser
      );

      assert.strictEqual(request.status, MediaRequestStatus.APPROVED);
    });

    it('should stay PENDING when user lacks auto-approve permissions', async () => {
      const request = await MediaRequest.request(
        {
          mediaType: MediaType.BOOK,
          mediaId: 0,
          openLibraryId: 'OL66666W',
        },
        regularUser
      );

      assert.strictEqual(request.status, MediaRequestStatus.PENDING);
    });
  });

  describe('Quota enforcement', () => {
    it('should reject book request when book quota is exceeded', async () => {
      const userRepo = getRepository(User);
      const quotaUser = new User();
      quotaUser.plexId = 996;
      quotaUser.plexToken = 'quotauser';
      quotaUser.plexUsername = 'quotauser';
      quotaUser.username = 'quotauser';
      quotaUser.email = 'quota@seerr.dev';
      quotaUser.permissions = Permission.REQUEST;
      quotaUser.bookQuotaLimit = 1;
      quotaUser.bookQuotaDays = 30;
      quotaUser.avatar = 'https://gravatar.com/avatar/test?default=mm&size=200';
      await userRepo.save(quotaUser);

      // First request should succeed
      await MediaRequest.request(
        {
          mediaType: MediaType.BOOK,
          mediaId: 0,
          openLibraryId: 'OL77777W',
        },
        quotaUser
      );

      // Second request should be rejected due to quota
      await assert.rejects(
        async () => {
          await MediaRequest.request(
            {
              mediaType: MediaType.BOOK,
              mediaId: 0,
              openLibraryId: 'OL88888W',
            },
            quotaUser
          );
        },
        (error: Error) => {
          assert.match(error.message, /quota/i);
          return true;
        }
      );
    });
  });

  describe('Request properties', () => {
    it('should set is4k to false for book requests', async () => {
      const request = await MediaRequest.request(
        {
          mediaType: MediaType.BOOK,
          mediaId: 0,
          openLibraryId: 'OL99000W',
        },
        regularUser
      );

      assert.strictEqual(request.is4k, false);
    });

    it('should store serverId, profileId, rootFolder, and tags when provided', async () => {
      const request = await MediaRequest.request(
        {
          mediaType: MediaType.BOOK,
          mediaId: 0,
          openLibraryId: 'OL99001W',
          serverId: 1,
          profileId: 2,
          rootFolder: '/books',
          tags: [1, 2, 3],
        },
        regularUser
      );

      assert.strictEqual(request.serverId, 1);
      assert.strictEqual(request.profileId, 2);
      assert.strictEqual(request.rootFolder, '/books');
      assert.deepStrictEqual(request.tags, [1, 2, 3]);
    });
  });

  describe('No synchronous Open Library calls (Fix #55)', () => {
    it('should not call getWorkEditions during book request creation', async () => {
      // Before the fix, MediaRequest.request() called openLibrary.getWorkEditions()
      // synchronously to look up ISBNs, which blocked the POST response.
      // After the fix, ISBN lookup is deferred to the async fulfillment step.
      //
      // We verify by mocking the ExternalAPI.get method and checking that
      // NO call to a /editions.json endpoint was made during request creation.
      // Note: The @AfterInsert notification hook may call other OL endpoints
      // (getWork, getAuthor) for notification content, which is expected and
      // does not block the response.
      const getMock = mock.method(
        Object.getPrototypeOf(Object.getPrototypeOf(new OpenLibraryAPI())),
        'get'
      );

      const request = await MediaRequest.request(
        {
          mediaType: MediaType.BOOK,
          mediaId: 0,
          openLibraryId: 'OL_NOAPI_TEST',
        },
        regularUser
      );

      assert.ok(request);
      assert.strictEqual(request.type, MediaType.BOOK);

      // The critical assertion: no calls to getWorkEditions were made.
      // Before Fix #55, the handler called getWorkEditions synchronously
      // to look up ISBNs, which blocked the POST response.
      const editionsCalls = getMock.mock.calls.filter(
        (call: { arguments: unknown[] }) => {
          const endpoint = call.arguments[0] as string;
          return endpoint.includes('/editions.json');
        }
      );

      assert.strictEqual(
        editionsCalls.length,
        0,
        'getWorkEditions should NOT be called during book request creation'
      );

      getMock.mock.restore();
    });

    it('should return the request immediately without fetching editions', async () => {
      // A complementary test: verify that the request is created with the
      // expected properties and no edition lookups happen inline.
      const getMock = mock.method(
        Object.getPrototypeOf(Object.getPrototypeOf(new OpenLibraryAPI())),
        'get'
      );

      const request = await MediaRequest.request(
        {
          mediaType: MediaType.BOOK,
          mediaId: 0,
          openLibraryId: 'OL_IMMEDIATE_TEST',
        },
        regularUser
      );

      // Verify the request was created with correct data
      assert.ok(request);
      assert.strictEqual(request.type, MediaType.BOOK);
      assert.strictEqual(request.is4k, false);

      // Verify the associated Media entity was created
      const mediaRepo = getRepository(Media);
      const media = await mediaRepo.findOne({
        where: {
          openLibraryId: 'OL_IMMEDIATE_TEST',
          mediaType: MediaType.BOOK,
        },
      });
      assert.ok(media, 'Media entity should exist');
      assert.strictEqual(media.openLibraryId, 'OL_IMMEDIATE_TEST');

      // No edition lookup calls should have been made
      const editionsCalls = getMock.mock.calls.filter(
        (call: { arguments: unknown[] }) => {
          const endpoint = call.arguments[0] as string;
          return endpoint.includes('/editions.json');
        }
      );

      assert.strictEqual(
        editionsCalls.length,
        0,
        'No getWorkEditions calls should be made during request creation'
      );

      getMock.mock.restore();
    });
  });
});
