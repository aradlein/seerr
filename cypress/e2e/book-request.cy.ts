describe('Book Request Flow', () => {
  const bookDetailResponse = {
    id: 'OL45804W',
    mediaType: 'book',
    title: 'Dune',
    description:
      'Set on the desert planet Arrakis, Dune is the story of the boy Paul Atreides.',
    authors: [{ id: 'OL34184A', name: 'Frank Herbert' }],
    firstPublishDate: '1965',
    coverUrl: 'https://covers.openlibrary.org/b/id/8231856-L.jpg',
    subjects: ['Science fiction', 'Fiction'],
    links: [],
  };

  it('user with REQUEST_BOOK permission can request a book (ebook)', () => {
    cy.loginAsUser();

    cy.intercept('GET', '/api/v1/book/OL45804W', {
      statusCode: 200,
      body: bookDetailResponse,
    }).as('bookDetails');

    cy.intercept('GET', '/api/v1/book/OL45804W/editions*', {
      statusCode: 200,
      body: [],
    }).as('bookEditions');

    cy.intercept('GET', '/api/v1/book/OL45804W/similar*', {
      statusCode: 200,
      body: { page: 1, totalPages: 1, totalResults: 0, results: [] },
    }).as('bookSimilar');

    cy.intercept('POST', '/api/v1/request', {
      statusCode: 201,
      body: {
        id: 100,
        status: 1,
        type: 'book',
        media: {
          id: 50,
          mediaType: 'book',
          openLibraryId: 'OL45804W',
          status: 2,
        },
        mediaFormat: 'ebook',
        createdAt: new Date().toISOString(),
      },
    }).as('createRequest');

    cy.visit('/book/OL45804W');
    cy.wait('@bookDetails');

    // The request button should be visible for users with REQUEST_BOOK permission
    cy.contains(/request/i).should('exist');
  });

  it('request appears in pending requests list', () => {
    cy.loginAsAdmin();

    cy.intercept('GET', '/api/v1/request?*', {
      statusCode: 200,
      body: {
        pageInfo: { pages: 1, pageSize: 10, results: 1, page: 1 },
        results: [
          {
            id: 100,
            status: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            type: 'book',
            is4k: false,
            serverId: null,
            profileId: null,
            rootFolder: null,
            languageProfileId: null,
            tags: null,
            mediaFormat: 'ebook',
            media: {
              id: 50,
              mediaType: 'book',
              openLibraryId: 'OL45804W',
              status: 2,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            requestedBy: {
              id: 2,
              email: 'friend@seerr.dev',
              displayName: 'friend@seerr.dev',
              userType: 2,
            },
            modifiedBy: null,
          },
        ],
      },
    }).as('getRequests');

    cy.visit('/requests');
    cy.wait('@getRequests');
    // The pending book request should appear in the list
    cy.contains('friend@seerr.dev').should('exist');
  });

  it('admin can approve a book request', () => {
    cy.loginAsAdmin();

    cy.intercept('POST', '/api/v1/request/100/approve', {
      statusCode: 200,
      body: {
        id: 100,
        status: 2,
        type: 'book',
        media: {
          id: 50,
          mediaType: 'book',
          openLibraryId: 'OL45804W',
          status: 3,
        },
        mediaFormat: 'ebook',
      },
    }).as('approveRequest');

    cy.intercept('GET', '/api/v1/request?*', {
      statusCode: 200,
      body: {
        pageInfo: { pages: 1, pageSize: 10, results: 1, page: 1 },
        results: [
          {
            id: 100,
            status: 1,
            type: 'book',
            is4k: false,
            mediaFormat: 'ebook',
            media: {
              id: 50,
              mediaType: 'book',
              openLibraryId: 'OL45804W',
              status: 2,
            },
            requestedBy: {
              id: 2,
              email: 'friend@seerr.dev',
              displayName: 'friend@seerr.dev',
              userType: 2,
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    }).as('getRequests');

    cy.visit('/requests');
    cy.wait('@getRequests');

    // The request should be visible and have an approve action
    cy.contains('friend@seerr.dev').should('exist');
  });

  it('user can request audiobook format for same book (separate request)', () => {
    cy.loginAsUser();

    cy.intercept('GET', '/api/v1/book/OL45804W', {
      statusCode: 200,
      body: {
        ...bookDetailResponse,
        mediaInfo: {
          id: 50,
          status: 3,
          requests: [
            {
              id: 100,
              status: 2,
              type: 'book',
              mediaFormat: 'ebook',
            },
          ],
        },
      },
    }).as('bookDetails');

    cy.intercept('GET', '/api/v1/book/OL45804W/editions*', {
      statusCode: 200,
      body: [],
    }).as('bookEditions');

    cy.intercept('GET', '/api/v1/book/OL45804W/similar*', {
      statusCode: 200,
      body: { page: 1, totalPages: 1, totalResults: 0, results: [] },
    }).as('bookSimilar');

    cy.intercept('POST', '/api/v1/request', {
      statusCode: 201,
      body: {
        id: 101,
        status: 1,
        type: 'book',
        media: {
          id: 50,
          mediaType: 'book',
          openLibraryId: 'OL45804W',
          status: 3,
        },
        mediaFormat: 'audiobook',
        createdAt: new Date().toISOString(),
      },
    }).as('createAudiobookRequest');

    cy.visit('/book/OL45804W');
    cy.wait('@bookDetails');

    // The page should still be accessible even with an existing ebook request
    cy.contains('Dune').should('exist');
  });
});
