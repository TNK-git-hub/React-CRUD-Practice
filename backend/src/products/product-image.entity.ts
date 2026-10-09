import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Product } from './product.entity';

// make "product_images" entity: one row per image url
@Entity('product_images')
export class ProductImage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  url: string;

  // keeps the images in the same order as dummyjson
  @Column({ type: 'int', default: 0 })
  position: number;

  // deleting a product also deletes its images
  @ManyToOne(() => Product, (product) => product.images, { onDelete: 'CASCADE' })
  product: Product;
}
