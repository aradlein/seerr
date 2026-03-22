describe('Book Permissions', () => {
  it('admin can see book permission toggles in user settings', () => {
    cy.loginAsAdmin();
    cy.visit('/users/1/settings/permissions');
    cy.contains(/request books|book/i).should('exist');
  });

  it('user with REQUEST_BOOK can see book search results', () => {
    cy.loginAsUser();
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
            coverUrl: 'https://covers.openlibrary.org/b/id/8231856-M.jpg',
          },
        ],
      },
    }).as('bookSearch');
    cy.visit('/search?query=dune&searchType=book');
    cy.wait('@bookSearch');
    cy.contains('Dune').should('exist');
  });
});
