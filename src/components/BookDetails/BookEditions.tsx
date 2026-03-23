import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import defineMessages from '@app/utils/defineMessages';
import type { BookEdition } from '@server/models/Book';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.BookDetails.BookEditions', {
  editions: 'Editions',
  format: 'Format',
  isbn: 'ISBN',
  publisher: 'Publisher',
  year: 'Year',
  pages: 'Pages',
  noeditions: 'No editions found.',
  unknownformat: 'Unknown',
});

interface EditionsResponse {
  totalResults: number;
  limit: number;
  offset: number;
  results: BookEdition[];
}

const BookEditions = () => {
  const router = useRouter();
  const intl = useIntl();

  const { data, error } = useSWR<EditionsResponse>(
    `/api/v1/book/${router.query.bookId}/editions?limit=20`
  );

  if (!data && !error) {
    return (
      <div className="mt-6">
        <h2 className="text-xl font-bold text-white">
          {intl.formatMessage(messages.editions)}
        </h2>
        <div className="mt-4">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (!data || data.results.length === 0) {
    return (
      <div className="mt-6">
        <h2 className="text-xl font-bold text-white">
          {intl.formatMessage(messages.editions)}
        </h2>
        <p className="mt-4 text-sm text-gray-400">
          {intl.formatMessage(messages.noeditions)}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h2 className="text-xl font-bold text-white">
        {intl.formatMessage(messages.editions)}
      </h2>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-gray-700 text-left text-sm text-gray-400">
              <th className="pb-2 pr-4 font-medium">
                {intl.formatMessage(messages.format)}
              </th>
              <th className="pb-2 pr-4 font-medium">
                {intl.formatMessage(messages.isbn)}
              </th>
              <th className="pb-2 pr-4 font-medium">
                {intl.formatMessage(messages.publisher)}
              </th>
              <th className="pb-2 pr-4 font-medium">
                {intl.formatMessage(messages.year)}
              </th>
              <th className="pb-2 font-medium">
                {intl.formatMessage(messages.pages)}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((edition) => (
              <tr
                key={edition.id}
                className="border-b border-gray-800 text-sm text-gray-300"
              >
                <td className="py-2 pr-4">
                  {edition.format ?? intl.formatMessage(messages.unknownformat)}
                </td>
                <td className="py-2 pr-4 font-mono text-xs">
                  {edition.isbn13?.[0] ?? edition.isbn10?.[0] ?? '—'}
                </td>
                <td className="py-2 pr-4">{edition.publishers?.[0] ?? '—'}</td>
                <td className="py-2 pr-4">{edition.publishDate ?? '—'}</td>
                <td className="py-2">{edition.pageCount ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BookEditions;
