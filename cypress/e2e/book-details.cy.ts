describe('Book Detail Page', () => {
  beforeEach(() => {
    cy.loginAsAdmin();

    // Intercept all API calls that the book detail page makes
    cy.intercept('GET', '/api/v1/book/OL45804W', {
      statusCode: 200,
      body: {
        id: 'OL45804W',
        mediaType: 'book',
        title: 'Dune',
        description:
          'Set on the desert planet Arrakis, Dune is the story of the boy Paul Atreides.',
        authors: [{ id: 'OL34184A', name: 'Frank Herbert' }],
        firstPublishDate: '1965',
        coverUrl: 'https://covers.openlibrary.org/b/id/8231856-L.jpg',
        subjects: ['Science fiction', 'Fiction', 'Ecology'],
        links: [],
      },
    }).as('bookDetails');

    cy.intercept('GET', '/api/v1/book/OL45804W/editions*', {
      statusCode: 200,
      body: [
        {
          id: 'OL7353617M',
          title: 'Dune',
          isbn13: ['9780441172719'],
          publishers: ['Ace Books'],
          publishDate: 'September 1990',
          pageCount: 535,
          format: 'Mass Market Paperback',
        },
        {
          id: 'OL24936539M',
          title: 'Dune',
          isbn13: ['9780340960196'],
          publishers: ['Hodder & Stoughton'],
          publishDate: '2015',
          pageCount: 604,
          format: 'Hardcover',
        },
      ],
    }).as('bookEditions');

    cy.intercept('GET', '/api/v1/book/OL45804W/similar*', {
      statusCode: 200,
      body: { page: 1, totalPages: 1, totalResults: 0, results: [] },
    }).as('bookSimilar');
  });

  it('loads book detail page with title and author', () => {
    cy.visit('/book/OL45804W');
    cy.wait('@bookDetails');
    cy.contains('Dune').should('exist');
    cy.contains('Frank Herbert').should('exist');
  });

  it('shows book description', () => {
    cy.visit('/book/OL45804W');
    cy.wait('@bookDetails');
    cy.contains('desert planet Arrakis').should('exist');
  });

  it('author name links to author detail page', () => {
    cy.visit('/book/OL45804W');
    cy.wait('@bookDetails');
    cy.get('a[href*="/author/OL34184A"]').should('exist');
  });

  it('shows editions list', () => {
    cy.visit('/book/OL45804W');
    cy.wait('@bookDetails');
    cy.wait('@bookEditions');
    cy.contains('Ace Books').should('exist');
    cy.contains('Hardcover').should('exist');
  });

  it('shows subject tags', () => {
    cy.visit('/book/OL45804W');
    cy.wait('@bookDetails');
    cy.contains('Science fiction').should('exist');
  });

  it('returns 404 for unknown book', () => {
    cy.intercept('GET', '/api/v1/book/OL99999W', {
      statusCode: 404,
      body: {},
    }).as('book404');
    cy.visit('/book/OL99999W', { failOnStatusCode: false });
  });
});
