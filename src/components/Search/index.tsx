import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import SearchFilter from '@app/components/Search/SearchFilter';
import useDiscover from '@app/hooks/useDiscover';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { BookResult } from '@server/models/Book';
import type {
  MovieResult,
  PersonResult,
  TvResult,
} from '@server/models/Search';
import { useRouter } from 'next/router';
import { useCallback } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Search', {
  search: 'Search',
  searchresults: 'Search Results',
});

const Search = () => {
  const intl = useIntl();
  const router = useRouter();

  const searchType =
    (router.query.searchType as string) === 'book' ? 'book' : 'default';

  const discoverOptions =
    searchType === 'book'
      ? { query: router.query.query, type: 'book' }
      : { query: router.query.query };

  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useDiscover<MovieResult | TvResult | PersonResult | BookResult>(
    `/api/v1/search`,
    discoverOptions,
    { hideAvailable: false, hideBlocklisted: false }
  );

  const handleFilterChange = useCallback(
    (filter: 'default' | 'book') => {
      const newQuery: Record<string, string> = {
        query: router.query.query as string,
      };
      if (filter === 'book') {
        newQuery.searchType = 'book';
      }
      router.push({ pathname: router.pathname, query: newQuery }, undefined, {
        shallow: true,
      });
    },
    [router]
  );

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

  return (
    <>
      <PageTitle title={intl.formatMessage(messages.search)} />
      <div className="mb-5 mt-1">
        <Header>{intl.formatMessage(messages.searchresults)}</Header>
      </div>
      <div className="mb-4">
        <SearchFilter activeFilter={searchType} onChange={handleFilterChange} />
      </div>
      <ListView
        items={titles}
        isEmpty={isEmpty}
        isLoading={
          isLoadingInitialData || (isLoadingMore && (titles?.length ?? 0) > 0)
        }
        isReachingEnd={isReachingEnd}
        onScrollBottom={fetchMore}
      />
    </>
  );
};

export default Search;
