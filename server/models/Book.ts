import OpenLibraryAPI from '@server/api/openlibrary';
import type {
  OLAuthorDetails,
  OLEditionDetails,
  OLSearchResult,
  OLWorkDetails,
} from '@server/api/openlibrary/interfaces';
import type Media from '@server/entity/Media';

export interface BookResult {
  id: string; // Open Library Work OLID (e.g., "OL45804W")
  mediaType: 'book';
  title: string;
  authors: { id: string; name: string }[];
  firstPublishYear?: number;
  coverUrl?: string;
  editionCount?: number;
  isbn?: string[];
  subjects?: string[];
  pageCount?: number;
  rating?: number;
  mediaInfo?: Media;
}

export interface BookDetails {
  id: string;
  mediaType: 'book';
  title: string;
  description?: string;
  authors: { id: string; name: string }[];
  firstPublishDate?: string;
  coverUrl?: string;
  subjects?: string[];
  links?: { url: string; title: string }[];
}

export interface BookEdition {
  id: string; // Edition OLID
  title: string;
  isbn10?: string[];
  isbn13?: string[];
  publishers?: string[];
  publishDate?: string;
  pageCount?: number;
  format?: string; // "Hardcover", "Paperback", etc.
  coverUrl?: string;
  languages?: string[];
}

export interface AuthorResult {
  id: string; // Author OLID
  name: string;
  bio?: string;
  birthDate?: string;
  deathDate?: string;
  photoUrl?: string;
  alternateNames?: string[];
  links?: { url: string; title: string }[];
  remoteIds?: {
    wikidata?: string;
    goodreads?: string;
    amazon?: string;
  };
}

// Mapper functions

export const mapSearchResultToBookResult = (
  result: OLSearchResult
): BookResult => {
  const olid = OpenLibraryAPI.extractOlid(result.key);
  const authors: { id: string; name: string }[] = [];

  if (result.author_name && result.author_key) {
    for (let i = 0; i < result.author_name.length; i++) {
      authors.push({
        id: OpenLibraryAPI.extractOlid(result.author_key[i] ?? ''),
        name: result.author_name[i],
      });
    }
  }

  return {
    id: olid,
    mediaType: 'book',
    title: result.title,
    authors,
    firstPublishYear: result.first_publish_year,
    coverUrl: result.cover_i
      ? OpenLibraryAPI.getCoverUrl(result.cover_i, 'M')
      : result.isbn?.[0]
        ? OpenLibraryAPI.getCoverUrlByISBN(result.isbn[0], 'M')
        : undefined,
    editionCount: result.edition_count,
    isbn: result.isbn?.slice(0, 5), // Limit ISBNs to avoid huge payloads
    subjects: result.subject?.slice(0, 10),
    pageCount: result.number_of_pages_median,
    rating: result.ratings_average,
  };
};

export const mapWorkToBookDetails = (
  work: OLWorkDetails,
  authorDetails?: OLAuthorDetails[]
): BookDetails => {
  const olid = OpenLibraryAPI.extractOlid(work.key);

  const authors: { id: string; name: string }[] = (authorDetails ?? []).map(
    (author) => ({
      id: OpenLibraryAPI.extractOlid(author.key),
      name: author.name,
    })
  );

  return {
    id: olid,
    mediaType: 'book',
    title: work.title,
    description: OpenLibraryAPI.normalizeDescription(work.description),
    authors,
    firstPublishDate: work.first_publish_date,
    coverUrl: work.covers?.[0]
      ? OpenLibraryAPI.getCoverUrl(work.covers[0], 'L')
      : undefined,
    subjects: work.subjects?.slice(0, 20),
    links: work.links,
  };
};

export const mapEditionToBookEdition = (
  edition: OLEditionDetails
): BookEdition => {
  const olid = OpenLibraryAPI.extractOlid(edition.key);

  return {
    id: olid,
    title: edition.title,
    isbn10: edition.isbn_10,
    isbn13: edition.isbn_13,
    publishers: edition.publishers,
    publishDate: edition.publish_date,
    pageCount: edition.number_of_pages,
    format: edition.physical_format,
    coverUrl: edition.covers?.[0]
      ? OpenLibraryAPI.getCoverUrl(edition.covers[0], 'M')
      : undefined,
    languages: edition.languages?.map((l) => l.key.split('/').pop() ?? l.key),
  };
};

export const mapAuthorToAuthorResult = (
  author: OLAuthorDetails
): AuthorResult => {
  const olid = OpenLibraryAPI.extractOlid(author.key);

  return {
    id: olid,
    name: author.name,
    bio: OpenLibraryAPI.normalizeDescription(author.bio),
    birthDate: author.birth_date,
    deathDate: author.death_date,
    photoUrl: author.photos?.[0]
      ? OpenLibraryAPI.getAuthorPhotoUrl(olid, 'L')
      : undefined,
    alternateNames: author.alternate_names,
    links: author.links,
    remoteIds: author.remote_ids,
  };
};
