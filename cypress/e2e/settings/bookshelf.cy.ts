describe('Bookshelf Settings', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
  });

  it('services page shows Bookshelf section', () => {
    cy.visit('/settings/services');
    cy.contains(/bookshelf/i).should('exist');
  });

  it('shows Add Bookshelf button', () => {
    cy.visit('/settings/services');
    cy.contains(/add.*bookshelf/i).should('exist');
  });

  it('opens Bookshelf modal with default port 8787', () => {
    cy.visit('/settings/services');
    cy.contains(/add.*bookshelf/i).click();
    // Modal should open with default port value
    cy.get('input[name="port"]').should('have.value', '8787');
  });

  it('Bookshelf modal has required fields', () => {
    cy.visit('/settings/services');
    cy.contains(/add.*bookshelf/i).click();
    cy.get('input[name="hostname"]').should('exist');
    cy.get('input[name="port"]').should('exist');
    cy.get('input[name="apiKey"]').should('exist');
    cy.get('input[name="name"]').should('exist');
  });
});
