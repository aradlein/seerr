export interface OLSearchResponse {
  numFound: number;
  start: number;
  docs: OLSearchResult[];
}

export interface OLSearchResult {
  key: string; // "/works/OL45804W"
  title: string;
  author_name?: string[];
  author_key?: string[];
  first_publish_year?: number;
  cover_i?: number; // Cover ID for covers API
  edition_count?: number;
  isbn?: string[];
  subject?: string[];
  number_of_pages_median?: number;
  ratings_average?: number;
}

export interface OLWorkDetails {
  key: string;
  title: string;
  description?: string | { value: string };
  covers?: number[];
  subjects?: string[];
  authors?: { author: { key: string }; type?: { key: string } }[];
  first_publish_date?: string;
  links?: { url: string; title: string }[];
}

export interface OLEditionDetails {
  key: string;
  title: string;
  description?: string | { value: string };
  isbn_10?: string[];
  isbn_13?: string[];
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  physical_format?: string; // "Hardcover", "Paperback", etc.
  covers?: number[];
  works?: { key: string }[];
  languages?: { key: string }[];
}

export interface OLAuthorDetails {
  key: string;
  name: string;
  bio?: string | { value: string };
  birth_date?: string;
  death_date?: string;
  photos?: number[];
  alternate_names?: string[];
  links?: { url: string; title: string }[];
  remote_ids?: {
    wikidata?: string;
    goodreads?: string;
    amazon?: string;
  };
}

export interface OLAuthorWorksResponse {
  size: number;
  entries: OLWorkDetails[];
}

export interface OLEditionsResponse {
  entries: OLEditionDetails[];
}
