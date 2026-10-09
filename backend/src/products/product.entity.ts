import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProductImage } from './product-image.entity';
import { Review } from './review.entity';
import { Tag } from './tag.entity';

// turn string to number func
export const numeric = {
  to: (value: number) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

// embedded object: stored as columns dimensionsWidth, dimensionsHeight, dimensionsDepth
// but returned as { width, height, depth } like dummyjson
export class Dimensions {
  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numeric })
  width: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numeric })
  height: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numeric })
  depth: number | null;
}

// make "products" entity
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

  @Column({ type: 'varchar', unique: true, nullable: true })
  sku: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numeric })
  price: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0, transformer: numeric })
  discountPercentage: number;

  @Column({ type: 'numeric', precision: 3, scale: 2, default: 0, transformer: numeric })
  rating: number;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @Column({ type: 'int', default: 1 })
  minimumOrderQuantity: number;

  @Column({ type: 'varchar', nullable: true })
  availabilityStatus: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numeric })
  weight: number | null;

  @Column(() => Dimensions)
  dimensions: Dimensions;

  @Column({ type: 'varchar', nullable: true })
  warrantyInformation: string | null;

  @Column({ type: 'varchar', nullable: true })
  shippingInformation: string | null;

  @Column({ type: 'varchar', nullable: true })
  returnPolicy: string | null;

  // from dummyjson "meta"
  @Column({ type: 'varchar', nullable: true })
  barcode: string | null;

  @Column({ type: 'varchar', nullable: true })
  qrCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  thumbnail: string | null;

  // one product -> many images (table "product_images")
  @OneToMany(() => ProductImage, (image) => image.product, { cascade: true })
  images: ProductImage[];


  // count all reviews for this product
  reviewCount?: number;

  // one product -> many reviews (table "reviews")
  @OneToMany(() => Review, (review) => review.product, { cascade: true })
  reviews: Review[];

  // many products <-> many tags (join table "product_tags")
  @ManyToMany(() => Tag, (tag) => tag.products)
  @JoinTable({
    name: 'product_tags',
    joinColumn: { name: 'productId' },
    inverseJoinColumn: { name: 'tagId' },
  })
  tags: Tag[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
