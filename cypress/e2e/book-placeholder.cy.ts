describe('Book Placeholder Image', () => {
  it('SVG placeholder file exists', () => {
    cy.request('/images/seerr_book_not_found.svg').then((resp) => {
      expect(resp.status).to.eq(200);
      expect(resp.headers['content-type']).to.include('svg');
    });
  });
});
