import OpenLibraryAPI from '@server/api/openlibrary';
import TheMovieDb from '@server/api/themoviedb';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import type { WatchlistItem } from '@server/interfaces/api/discoverInterfaces';
import logger from '@server/logger';
import { DbAwareColumn } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { ZodNumber, ZodOptional, ZodString } from 'zod';

export class DuplicateWatchlistRequestError extends Error {}
export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

@Entity()
@Unique('UNIQUE_USER_DB', ['tmdbId', 'mediaType', 'requestedBy'])
export class Watchlist implements WatchlistItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  public ratingKey = '';

  @Column({ type: 'varchar' })
  public mediaType: MediaType;

  @Column({ type: 'varchar' })
  title = '';

  @Column()
  @Index()
  public tmdbId: number;

  @Column({ nullable: true, type: 'varchar' })
  @Index()
  public openLibraryId?: string | null;

  @ManyToOne(() => User, (user) => user.watchlists, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @Index()
  public requestedBy: User;

  @ManyToOne(() => Media, (media) => media.watchlists, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @Index()
  public media: Media;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @DbAwareColumn({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;

  constructor(init?: Partial<Watchlist>) {
    Object.assign(this, init);
  }

  public static async createWatchlist({
    watchlistRequest,
    user,
  }: {
    watchlistRequest: {
      mediaType: MediaType;
      ratingKey?: ZodOptional<ZodString>['_output'];
      title?: ZodOptional<ZodString>['_output'];
      tmdbId: ZodNumber['_output'];
      openLibraryId?: string;
    };
    user: User;
  }): Promise<Watchlist> {
    const watchlistRepository = getRepository(this);
    const mediaRepository = getRepository(Media);
    const isBook = watchlistRequest.mediaType === MediaType.BOOK;

    // For books, check duplicates by openLibraryId; for movies/TV, by tmdbId
    if (isBook && watchlistRequest.openLibraryId) {
      const existing = await watchlistRepository
        .createQueryBuilder('watchlist')
        .leftJoinAndSelect('watchlist.requestedBy', 'user')
        .where('user.id = :userId', { userId: user.id })
        .andWhere('watchlist.openLibraryId = :openLibraryId', {
          openLibraryId: watchlistRequest.openLibraryId,
        })
        .andWhere('watchlist.mediaType = :mediaType', {
          mediaType: watchlistRequest.mediaType,
        })
        .getMany();

      if (existing && existing.length > 0) {
        logger.warn('Duplicate request for watchlist blocked', {
          openLibraryId: watchlistRequest.openLibraryId,
          mediaType: watchlistRequest.mediaType,
          label: 'Watchlist',
        });

        throw new DuplicateWatchlistRequestError();
      }

      // Find or create media for the book
      let media = await mediaRepository.findOne({
        where: {
          openLibraryId: watchlistRequest.openLibraryId,
          mediaType: MediaType.BOOK,
        },
      });

      if (!media) {
        media = new Media({
          tmdbId: 0,
          openLibraryId: watchlistRequest.openLibraryId,
          mediaType: MediaType.BOOK,
        });
      }

      // Fetch title from Open Library if not provided
      let title = watchlistRequest.title;
      if (!title && watchlistRequest.openLibraryId) {
        try {
          const openLibrary = new OpenLibraryAPI();
          const work = await openLibrary.getWork(
            watchlistRequest.openLibraryId
          );
          title = work.title;
        } catch {
          title = 'Unknown Book';
        }
      }

      const watchlist = new this({
        ...watchlistRequest,
        title: title ?? '',
        openLibraryId: watchlistRequest.openLibraryId,
        requestedBy: user,
        media,
      });

      await mediaRepository.save(media);
      await watchlistRepository.save(watchlist);
      return watchlist;
    } else {
      // Movie/TV path
      const tmdb = new TheMovieDb();
      const tmdbMedia =
        watchlistRequest.mediaType === MediaType.MOVIE
          ? await tmdb.getMovie({ movieId: watchlistRequest.tmdbId })
          : await tmdb.getTvShow({ tvId: watchlistRequest.tmdbId });

      const existing = await watchlistRepository
        .createQueryBuilder('watchlist')
        .leftJoinAndSelect('watchlist.requestedBy', 'user')
        .where('user.id = :userId', { userId: user.id })
        .andWhere('watchlist.tmdbId = :tmdbId', {
          tmdbId: watchlistRequest.tmdbId,
        })
        .andWhere('watchlist.mediaType = :mediaType', {
          mediaType: watchlistRequest.mediaType,
        })
        .getMany();

      if (existing && existing.length > 0) {
        logger.warn('Duplicate request for watchlist blocked', {
          tmdbId: watchlistRequest.tmdbId,
          mediaType: watchlistRequest.mediaType,
          label: 'Watchlist',
        });

        throw new DuplicateWatchlistRequestError();
      }

      let media = await mediaRepository.findOne({
        where: {
          tmdbId: watchlistRequest.tmdbId,
          mediaType: watchlistRequest.mediaType,
        },
      });

      if (!media) {
        media = new Media({
          tmdbId: tmdbMedia.id,
          tvdbId: tmdbMedia.external_ids.tvdb_id,
          mediaType: watchlistRequest.mediaType,
        });
      }

      const watchlist = new this({
        ...watchlistRequest,
        requestedBy: user,
        media,
      });

      await mediaRepository.save(media);
      await watchlistRepository.save(watchlist);
      return watchlist;
    }
  }

  public static async deleteWatchlist(
    tmdbId: Watchlist['tmdbId'],
    mediaType: MediaType,
    user: User,
    openLibraryId?: string
  ): Promise<Watchlist | null> {
    const watchlistRepository = getRepository(this);

    let watchlist: Watchlist | null;

    // For books, look up by openLibraryId if provided
    if (mediaType === MediaType.BOOK && openLibraryId) {
      watchlist = await watchlistRepository.findOneBy({
        openLibraryId,
        mediaType,
        requestedBy: { id: user.id },
      });
    } else {
      watchlist = await watchlistRepository.findOneBy({
        tmdbId,
        mediaType,
        requestedBy: { id: user.id },
      });
    }

    if (!watchlist) {
      throw new NotFoundError('not Found');
    }

    await watchlistRepository.delete(watchlist.id);

    return watchlist;
  }
}
