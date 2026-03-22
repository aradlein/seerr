import defineMessages from '@app/utils/defineMessages';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Search.SearchFilter', {
  moviesAndTv: 'Movies & TV',
  books: 'Books',
});

interface SearchFilterProps {
  activeFilter: 'default' | 'book';
  onChange: (filter: 'default' | 'book') => void;
}

const SearchFilter = ({ activeFilter, onChange }: SearchFilterProps) => {
  const intl = useIntl();

  return (
    <div className="inline-flex rounded-lg bg-gray-800 p-1" role="tablist">
      <button
        role="tab"
        aria-selected={activeFilter === 'default'}
        className={`rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          activeFilter === 'default'
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'text-gray-400 hover:text-white'
        }`}
        onClick={() => onChange('default')}
      >
        {intl.formatMessage(messages.moviesAndTv)}
      </button>
      <button
        role="tab"
        aria-selected={activeFilter === 'book'}
        className={`rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          activeFilter === 'book'
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'text-gray-400 hover:text-white'
        }`}
        onClick={() => onChange('book')}
      >
        {intl.formatMessage(messages.books)}
      </button>
    </div>
  );
};

export default SearchFilter;
