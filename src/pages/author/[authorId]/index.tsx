import AuthorDetails from '@app/components/AuthorDetails';
import type { AuthorResult } from '@server/models/Book';
import axios from 'axios';
import type { GetServerSideProps, NextPage } from 'next';

interface AuthorPageProps {
  author?: AuthorResult;
}

const AuthorPage: NextPage<AuthorPageProps> = ({ author }) => {
  return <AuthorDetails author={author} />;
};

export const getServerSideProps: GetServerSideProps<AuthorPageProps> = async (
  ctx
) => {
  const response = await axios.get<AuthorResult>(
    `http://${process.env.HOST || 'localhost'}:${
      process.env.PORT || 5055
    }/api/v1/author/${ctx.query.authorId}`,
    {
      headers: ctx.req?.headers?.cookie
        ? { cookie: ctx.req.headers.cookie }
        : undefined,
    }
  );

  return {
    props: {
      author: response.data,
    },
  };
};

export default AuthorPage;
