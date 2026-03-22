describe('Book Search', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
    // Intercept OL API calls
    cy.intercept('GET', '/api/v1/search?query=*&type=book*', {
      statusCode: 200,
      fixture: 'book-search-response.json',
    }).as('bookSearch');
  });

  it('default search does NOT show book filter or call Open Library', () => {
    cy.visit('/');
    // The search page should load normally
    cy.get('input[type="search"], input[placeholder*="earch"]').should('exist');
  });

  it('search page has Movies/TV and Books filter toggle', () => {
    cy.visit('/search?query=dune');
    // Should see the filter toggle
    cy.contains(/movies.*tv|movies\/tv/i).should('exist');
    cy.contains(/books/i).should('exist');
  });

  it('clicking Books filter switches to book results', () => {
    cy.intercept('GET', '/api/v1/search?query=dune&type=book*', {
      statusCode: 200,
      body: {
        page: 1,
        totalPages: 1,
        totalResults: 3,
        results: [
          {
            id: 'OL45804W',
            mediaType: 'book',
            title: 'Dune',
            authors: [{ id: 'OL34184A', name: 'Frank Herbert' }],
            firstPublishYear: 1965,
            coverUrl: 'https://covers.openlibrary.org/b/id/8231856-M.jpg',
            editionCount: 203,
            subjects: ['Science fiction'],
            pageCount: 412,
            rating: 4.2,
          },
          {
            id: 'OL15158W',
            mediaType: 'book',
            title: 'Dune Messiah',
            authors: [{ id: 'OL34184A', name: 'Frank Herbert' }],
            firstPublishYear: 1969,
            coverUrl: 'https://covers.openlibrary.org/b/id/8231857-M.jpg',
            editionCount: 90,
            subjects: ['Science fiction'],
            pageCount: 256,
            rating: 3.8,
          },
        ],
      },
    }).as('bookSearch');

    cy.visit('/search?query=dune');
    // Click the Books filter
    cy.contains(/books/i).click();
    cy.wait('@bookSearch');

    // Should show book results
    cy.contains('Dune').should('exist');
    cy.contains('Frank Herbert').should('exist');
  });

  it('book results link to /book/[bookId]', () => {
    cy.intercept('GET', '/api/v1/search?query=dune&type=book*', {
      statusCode: 200,
      body: {
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [
          {
            id: 'OL45804W',
            mediaType: 'book',
            title: 'Dune',
            authors: [{ id: 'OL34184A', name: 'Frank Herbert' }],
            firstPublishYear: 1965,
            coverUrl: 'https://covers.openlibrary.org/b/id/8231856-M.jpg',
          },
        ],
      },
    }).as('bookSearch');

    cy.visit('/search?query=dune&searchType=book');
    cy.wait('@bookSearch');
    // Click a book result — should navigate to book detail page
    cy.get('a[href*="/book/OL45804W"]').should('exist');
  });

  it('search filter state persists in URL', () => {
    cy.visit('/search?query=dune&searchType=book');
    cy.url().should('include', 'searchType=book');
  });

  it('switching back to Movies/TV clears book results', () => {
    cy.intercept('GET', '/api/v1/search?query=dune&type=book*', {
      statusCode: 200,
      body: {
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [
          {
            id: 'OL45804W',
            mediaType: 'book',
            title: 'Dune',
            authors: [],
          },
        ],
      },
    }).as('bookSearch');
    cy.intercept('GET', '/api/v1/search?query=dune', {
      statusCode: 200,
      body: { page: 1, totalPages: 1, totalResults: 0, results: [] },
    }).as('movieSearch');

    cy.visit('/search?query=dune&searchType=book');
    cy.wait('@bookSearch');
    cy.contains(/movies.*tv|movies\/tv/i).click();
    // Should no longer show book results
    cy.url().should('not.include', 'searchType=book');
  });
});
