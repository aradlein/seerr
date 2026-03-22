describe('Author Detail Page', () => {
  beforeEach(() => {
    cy.loginAsAdmin();

    cy.intercept('GET', '/api/v1/author/OL34184A', {
      statusCode: 200,
      body: {
        id: 'OL34184A',
        name: 'Frank Herbert',
        bio: 'Franklin Patrick Herbert Jr. was an American science-fiction author best known for the novel Dune.',
        birthDate: '8 October 1920',
        deathDate: '11 February 1986',
        photoUrl: 'https://covers.openlibrary.org/a/olid/OL34184A-L.jpg',
        alternateNames: ['Franklin Patrick Herbert'],
        links: [
          {
            url: 'https://en.wikipedia.org/wiki/Frank_Herbert',
            title: 'Wikipedia',
          },
        ],
      },
    }).as('authorDetails');

    cy.intercept('GET', '/api/v1/author/OL34184A/works*', {
      statusCode: 200,
      body: {
        page: 1,
        totalPages: 1,
        totalResults: 2,
        results: [
          {
            id: 'OL45804W',
            mediaType: 'book',
            title: 'Dune',
            coverUrl: 'https://covers.openlibrary.org/b/id/8231856-M.jpg',
            authors: [{ id: 'OL34184A', name: 'Frank Herbert' }],
          },
          {
            id: 'OL15158W',
            mediaType: 'book',
            title: 'Dune Messiah',
            coverUrl: null,
            authors: [{ id: 'OL34184A', name: 'Frank Herbert' }],
          },
        ],
      },
    }).as('authorWorks');
  });

  it('loads author page with name and bio', () => {
    cy.visit('/author/OL34184A');
    cy.wait('@authorDetails');
    cy.contains('Frank Herbert').should('exist');
    cy.contains('American science-fiction author').should('exist');
  });

  it('shows birth and death dates', () => {
    cy.visit('/author/OL34184A');
    cy.wait('@authorDetails');
    cy.contains('1920').should('exist');
    cy.contains('1986').should('exist');
  });

  it('shows bibliography / works', () => {
    cy.visit('/author/OL34184A');
    cy.wait('@authorDetails');
    cy.wait('@authorWorks');
    cy.contains('Dune').should('exist');
    cy.contains('Dune Messiah').should('exist');
  });
});
