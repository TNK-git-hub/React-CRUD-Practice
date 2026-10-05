import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

const numeric = {
  to: (value: number) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  @Column({ type: 'varchar', nullable: true })
  brand: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numeric })
  price: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0, transformer: numeric })
  discountPercentage: number;

  @Column({ type: 'numeric', precision: 3, scale: 2, default: 0, transformer: numeric })
  rating: number;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @Column({ type: 'varchar', nullable: true })
  thumbnail: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  images: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
