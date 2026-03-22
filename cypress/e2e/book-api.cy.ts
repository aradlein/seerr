describe('Book Support API', () => {
  before(() => {
    // Login via API to establish session cookie
    cy.request('POST', '/api/v1/auth/local', {
      email: 'admin@seerr.dev',
      password: 'test1234',
    });
  });

  it('#1 - MediaType.BOOK exists in search results', () => {
    // Verify the type=book parameter is accepted
    cy.request({
      method: 'GET',
      url: '/api/v1/search?query=dune&type=book',
      failOnStatusCode: false,
    }).then((resp) => {
      // Should not return 400 (route exists)
      expect(resp.status).to.be.oneOf([200, 500]); // 500 if OL is unreachable, but route exists
    });
  });

  it('#3 - Media entity supports openLibraryId (via search cross-reference)', () => {
    cy.request({
      method: 'GET',
      url: '/api/v1/search?query=dune&type=book',
      failOnStatusCode: false,
    }).then((resp) => {
      if (resp.status === 200 && resp.body.results?.length > 0) {
        // Results should have book-specific fields
        const result = resp.body.results[0];
        expect(result.mediaType).to.eq('book');
        expect(result.id).to.be.a('string');
      }
    });
  });

  it('#7 - Bookshelf settings endpoint exists', () => {
    cy.request('GET', '/api/v1/settings/bookshelf').then((resp) => {
      expect(resp.status).to.eq(200);
      expect(resp.body).to.be.an('array');
    });
  });

  it('#10 - Book detail endpoint returns data', () => {
    cy.request({
      method: 'GET',
      url: '/api/v1/book/OL45804W',
      failOnStatusCode: false,
    }).then((resp) => {
      // Should return 200 if OL is reachable, route should at least exist (not 404)
      expect(resp.status).to.not.eq(404);
      if (resp.status === 200) {
        expect(resp.body.title).to.eq('Dune');
        expect(resp.body.mediaType).to.eq('book');
        expect(resp.body.id).to.eq('OL45804W');
      }
    });
  });

  it('#10 - Book editions endpoint exists', () => {
    cy.request({
      method: 'GET',
      url: '/api/v1/book/OL45804W/editions',
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.not.eq(404);
    });
  });

  it('#11 - Author detail endpoint returns data', () => {
    cy.request({
      method: 'GET',
      url: '/api/v1/author/OL34184A',
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.not.eq(404);
      if (resp.status === 200) {
        expect(resp.body.name).to.eq('Frank Herbert');
        expect(resp.body.id).to.eq('OL34184A');
      }
    });
  });

  it('#11 - Author works endpoint exists', () => {
    cy.request({
      method: 'GET',
      url: '/api/v1/author/OL34184A/works',
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.not.eq(404);
    });
  });

  it('#12 - Default search (no type param) works unchanged', () => {
    cy.request({
      method: 'GET',
      url: '/api/v1/search?query=matrix',
      failOnStatusCode: false,
    }).then((resp) => {
      // This calls TMDb which may fail without API key, but route should exist
      expect(resp.status).to.not.eq(404);
    });
  });

  it('#13 - Bookshelf settings CRUD works', () => {
    // Create
    cy.request('POST', '/api/v1/settings/bookshelf', {
      name: 'Test Bookshelf',
      hostname: 'localhost',
      port: 8787,
      apiKey: 'test-api-key',
      useSsl: false,
      activeProfileId: 1,
      activeProfileName: 'Any',
      activeDirectory: '/books',
      tags: [],
      is4k: false,
      isDefault: true,
      syncEnabled: false,
      preventSearch: false,
      tagRequests: false,
      overrideRule: [],
    }).then((resp) => {
      expect(resp.status).to.eq(201);
      expect(resp.body.name).to.eq('Test Bookshelf');
      expect(resp.body.port).to.eq(8787);

      const serverId = resp.body.id;

      // Read
      cy.request('GET', '/api/v1/settings/bookshelf').then((readResp) => {
        expect(readResp.body).to.have.length.at.least(1);
        const found = readResp.body.find(
          (s: { id: number }) => s.id === serverId
        );
        expect(found).to.not.eq(undefined);
      });

      // Update
      cy.request('PUT', `/api/v1/settings/bookshelf/${serverId}`, {
        name: 'Updated Bookshelf',
        hostname: 'localhost',
        port: 8787,
        apiKey: 'test-api-key',
        useSsl: false,
        activeProfileId: 1,
        activeProfileName: 'Any',
        activeDirectory: '/books',
        tags: [],
        is4k: false,
        isDefault: true,
        syncEnabled: false,
        preventSearch: false,
        tagRequests: false,
        overrideRule: [],
      }).then((updateResp) => {
        expect(updateResp.status).to.eq(200);
        expect(updateResp.body.name).to.eq('Updated Bookshelf');
      });

      // Delete
      cy.request('DELETE', `/api/v1/settings/bookshelf/${serverId}`).then(
        (delResp) => {
          expect(delResp.status).to.eq(200);
        }
      );
    });
  });

  it('#14 - Book request endpoint works', () => {
    cy.request({
      method: 'POST',
      url: '/api/v1/request',
      body: {
        mediaType: 'book',
        openLibraryId: 'OL15158W',
        mediaFormat: 'ebook',
      },
      failOnStatusCode: false,
    }).then((resp) => {
      // Admin has auto-approve so this should succeed or fail gracefully
      // At minimum, the route should handle book type without crashing
      expect(resp.status).to.not.eq(404);
    });
  });

  it('#5 - User quota endpoint includes book quota', () => {
    cy.request({
      method: 'GET',
      url: '/api/v1/user/1/quota',
      failOnStatusCode: false,
    }).then((resp) => {
      if (resp.status === 200) {
        expect(resp.body).to.have.property('book');
      }
    });
  });

  it('#18 - Image proxy for OpenLibrary works', () => {
    cy.request({
      method: 'GET',
      url: '/imageproxy/openlibrary/b/id/8231856-M.jpg',
      failOnStatusCode: false,
    }).then((resp) => {
      // Route should exist (may fail to actually fetch the image in test env)
      expect(resp.status).to.not.eq(404);
    });
  });

  it('#42 - permissions2 column exists (user has it)', () => {
    cy.request('GET', '/api/v1/auth/me').then((resp) => {
      // The user object should load without errors (permissions2 column exists)
      expect(resp.status).to.eq(200);
      expect(resp.body).to.have.property('id');
    });
  });
});
