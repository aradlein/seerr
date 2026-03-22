import ServarrBase from './base';

class BookshelfAPI extends ServarrBase<{ bookId: number }> {
  constructor({ url, apiKey }: { url: string; apiKey: string }) {
    super({ url, apiKey, cacheName: 'bookshelf', apiName: 'Bookshelf' });
  }

  // Phase 3 will add: lookupBook, addBook, searchBook, getBook, getBookByForeignId, removeBook, etc.
}

export default BookshelfAPI;
