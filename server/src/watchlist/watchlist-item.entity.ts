import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('watchlist_items')
@Unique(['userId', 'showId'])
export class WatchlistItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column()
  showId: number;

  @Column()
  name: string;

  @Column({ type: 'text', default: '' })
  overview: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  posterPath: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  backdropPath: string | null;

  @Column({ type: 'varchar', length: 32, default: '' })
  firstAirDate: string;

  @Column({ type: 'float', default: 0 })
  voteAverage: number;

  @Column({ type: 'int', default: 0 })
  voteCount: number;

  @Column({ type: 'varchar', length: 255, default: '' })
  originalName: string;

  @Column({ type: 'varchar', length: 16, default: '' })
  originalLanguage: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  originCountry: string[];

  @Column({ type: 'boolean', default: false })
  watched: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.watchlistItems, { onDelete: 'CASCADE' })
  user: User;
}
