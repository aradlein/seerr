import CachedImage from '@app/components/Common/CachedImage';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import Tag from '@app/components/Common/Tag';
import RequestButton from '@app/components/RequestButton';
import Slider from '@app/components/Slider';
import TitleCard from '@app/components/TitleCard';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type {
  BookDetails as BookDetailsType,
  BookResult,
} from '@server/models/Book';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import BookEditions from './BookEditions';

const messages = defineMessages('components.BookDetails', {
  overview: 'Overview',
  overviewunavailable: 'Overview unavailable.',
  firstpublished: 'First Published',
  subjects: 'Subjects',
  similar: 'Similar Books',
  by: 'by {authorList}',
});

interface SimilarBooksResponse {
  totalResults: number;
  results: BookResult[];
}

interface BookDetailsProps {
  book?: BookDetailsType;
}

const BookDetails = ({ book }: BookDetailsProps) => {
  const router = useRouter();
  const intl = useIntl();

  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<BookDetailsType>(`/api/v1/book/${router.query.bookId}`, {
    fallbackData: book,
  });

  const { data: similarData } = useSWR<SimilarBooksResponse>(
    `/api/v1/book/${router.query.bookId}/similar`
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={404} />;
  }

  const bookAttributes: React.ReactNode[] = [];

  if (data.firstPublishDate) {
    bookAttributes.push(<span>{data.firstPublishDate}</span>);
  }

  if (data.subjects && data.subjects.length > 0) {
    bookAttributes.push(
      <span>
        {data.subjects
          .slice(0, 3)
          .map((s) => s)
          .join(', ')}
      </span>
    );
  }

  const similarBooks = (similarData?.results ?? []).slice(0, 20);

  return (
    <div
      className="media-page"
      style={{
        height: 493,
      }}
    >
      <PageTitle title={data.title} />
      <div className="media-header">
        <div className="media-poster">
          <CachedImage
            type="openlibrary"
            src={data.coverUrl || '/images/seerr_book_not_found.svg'}
            alt={data.title}
            sizes="100vw"
            style={{ width: '100%', height: 'auto' }}
            width={400}
            height={600}
            priority
          />
        </div>
        <div className="media-title">
          <h1 data-testid="media-title">
            {data.title}{' '}
            {data.firstPublishDate && (
              <span className="media-year">
                ({data.firstPublishDate.slice(0, 4)})
              </span>
            )}
          </h1>
          {data.authors.length > 0 && (
            <span className="media-attributes">
              <span>
                {intl.formatMessage(messages.by, {
                  authorList: data.authors
                    .map((author) => author.name)
                    .join(', '),
                })}
              </span>
            </span>
          )}
          {data.authors.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {data.authors.map((author) => (
                <Link
                  key={author.id}
                  href={`/author/${author.id}`}
                  className="text-sm text-indigo-400 transition duration-200 hover:text-indigo-300 hover:underline"
                >
                  {author.name}
                </Link>
              ))}
            </div>
          )}
          <div className="media-actions mt-4">
            <RequestButton
              mediaType="book"
              tmdbId={0}
              onUpdate={() => revalidate()}
            />
          </div>
          <span className="media-attributes">
            {bookAttributes.length > 0 &&
              bookAttributes
                .map((t, k) => <span key={k}>{t}</span>)
                .reduce((prev, curr) => (
                  <>
                    {prev}
                    <span>|</span>
                    {curr}
                  </>
                ))}
          </span>
        </div>
      </div>
      <div className="media-overview">
        <div className="media-overview-left">
          <h2>{intl.formatMessage(messages.overview)}</h2>
          <p>
            {data.description
              ? data.description
              : intl.formatMessage(messages.overviewunavailable)}
          </p>
          {data.subjects && data.subjects.length > 0 && (
            <div className="mt-6">
              {data.subjects.slice(0, 12).map((subject, index) => (
                <span
                  key={`subject-${index}`}
                  className="mb-2 mr-2 inline-flex last:mr-0"
                >
                  <Tag>{subject}</Tag>
                </span>
              ))}
            </div>
          )}
          <BookEditions />
        </div>
        <div className="media-overview-right">
          <div className="media-facts">
            {data.firstPublishDate && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.firstpublished)}</span>
                <span className="media-fact-value">
                  {data.firstPublishDate}
                </span>
              </div>
            )}
            {data.links && data.links.length > 0 && (
              <div className="media-fact">
                <span className="media-fact-value">
                  {data.links.map((link, index) => (
                    <a
                      key={`link-${index}`}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-indigo-400 transition duration-200 hover:text-indigo-300 hover:underline"
                    >
                      {link.title}
                    </a>
                  ))}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      {similarBooks.length > 0 && (
        <>
          <div className="slider-header">
            <div className="slider-title">
              <span>{intl.formatMessage(messages.similar)}</span>
            </div>
          </div>
          <Slider
            sliderKey="similar-books"
            isLoading={!similarData}
            isEmpty={similarBooks.length === 0}
            items={similarBooks.map((book) => (
              <TitleCard
                key={book.id}
                id={book.id}
                image={book.coverUrl}
                title={book.title}
                year={book.firstPublishYear?.toString()}
                mediaType="book"
                summary={
                  book.authors?.map((a) => a.name).join(', ') ?? undefined
                }
              />
            ))}
          />
        </>
      )}
      <div className="extra-bottom-space relative" />
    </div>
  );
};

export default BookDetails;
