import CachedImage from '@app/components/Common/CachedImage';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import Slider from '@app/components/Slider';
import TitleCard from '@app/components/TitleCard';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { UserIcon } from '@heroicons/react/24/outline';
import type { AuthorResult, BookDetails } from '@server/models/Book';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.AuthorDetails', {
  biography: 'Biography',
  biounavailable: 'Biography unavailable.',
  born: 'Born',
  died: 'Died',
  works: 'Works',
  alternatenames: 'Also known as',
});

interface AuthorWorksResponse {
  totalResults: number;
  limit: number;
  offset: number;
  results: BookDetails[];
}

interface AuthorDetailsProps {
  author?: AuthorResult;
}

const AuthorDetails = ({ author }: AuthorDetailsProps) => {
  const router = useRouter();
  const intl = useIntl();

  const { data, error } = useSWR<AuthorResult>(
    `/api/v1/author/${router.query.authorId}`,
    {
      fallbackData: author,
    }
  );

  const { data: worksData } = useSWR<AuthorWorksResponse>(
    `/api/v1/author/${router.query.authorId}/works?limit=20`
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={404} />;
  }

  const works = worksData?.results ?? [];

  return (
    <div
      className="media-page"
      style={{
        height: 493,
      }}
    >
      <PageTitle title={data.name} />
      <div className="media-header">
        <div className="media-poster">
          {data.photoUrl ? (
            <CachedImage
              type="openlibrary"
              src={data.photoUrl}
              alt={data.name}
              sizes="100vw"
              style={{ width: '100%', height: 'auto' }}
              width={400}
              height={600}
              priority
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-lg bg-gray-800">
              <UserIcon className="h-16 w-16 text-gray-600" />
            </div>
          )}
        </div>
        <div className="media-title">
          <h1 data-testid="media-title">{data.name}</h1>
          {(data.birthDate || data.deathDate) && (
            <span className="media-attributes">
              {data.birthDate && (
                <span>
                  {intl.formatMessage(messages.born)}: {data.birthDate}
                </span>
              )}
              {data.birthDate && data.deathDate && <span>|</span>}
              {data.deathDate && (
                <span>
                  {intl.formatMessage(messages.died)}: {data.deathDate}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
      <div className="media-overview">
        <div className="media-overview-left">
          <h2>{intl.formatMessage(messages.biography)}</h2>
          <p>
            {data.bio ? data.bio : intl.formatMessage(messages.biounavailable)}
          </p>
          {data.alternateNames && data.alternateNames.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-400">
                {intl.formatMessage(messages.alternatenames)}
              </h3>
              <p className="mt-1 text-sm text-gray-300">
                {data.alternateNames.slice(0, 5).join(', ')}
              </p>
            </div>
          )}
        </div>
        <div className="media-overview-right">
          <div className="media-facts">
            {data.birthDate && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.born)}</span>
                <span className="media-fact-value">{data.birthDate}</span>
              </div>
            )}
            {data.deathDate && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.died)}</span>
                <span className="media-fact-value">{data.deathDate}</span>
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
      {works.length > 0 && (
        <>
          <div className="slider-header">
            <div className="slider-title">
              <span>{intl.formatMessage(messages.works)}</span>
            </div>
          </div>
          <Slider
            sliderKey="author-works"
            isLoading={!worksData}
            isEmpty={works.length === 0}
            items={works.map((work) => (
              <TitleCard
                key={work.id}
                id={work.id}
                image={work.coverUrl}
                title={work.title}
                year={
                  work.firstPublishDate
                    ? work.firstPublishDate.slice(0, 4)
                    : undefined
                }
                mediaType="book"
                summary={
                  work.authors?.map((a) => a.name).join(', ') ?? undefined
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

export default AuthorDetails;
