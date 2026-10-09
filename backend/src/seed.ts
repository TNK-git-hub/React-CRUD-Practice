import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from './app.module';
import { Product } from './products/product.entity';
import { Tag } from './products/tag.entity';
// This file will be run by pnpm to reset to original data that was fetch fro dummyjson
const SOURCE_URL = 'https://dummyjson.com/products?limit=0';

type DummyReview = {
  rating: number;
  comment?: string;
  date: string;
  reviewerName: string;
  reviewerEmail: string;
};

type DummyProduct = {
  id: number;
  title: string;
  description?: string;
  category?: string;
  brand?: string;
  sku?: string;
  price: number;
  discountPercentage?: number;
  rating?: number;
  stock?: number;
  minimumOrderQuantity?: number;
  availabilityStatus?: string;
  weight?: number;
  dimensions?: { width: number; height: number; depth: number };
  warrantyInformation?: string;
  shippingInformation?: string;
  returnPolicy?: string;
  meta?: { createdAt: string; updatedAt: string; barcode: string; qrCode: string };
  thumbnail?: string;
  images?: string[];
  tags?: string[];
  reviews?: DummyReview[];
};

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const productRepo = app.get<Repository<Product>>(getRepositoryToken(Product));
  const tagRepo = app.get<Repository<Tag>>(getRepositoryToken(Tag));

  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  const { products } = (await res.json()) as { products: DummyProduct[] };

  // Wipe every table and reset the id counters so re-running gives exactly the source data.
  await productRepo.query(
    'TRUNCATE products, product_images, reviews, tags, product_tags RESTART IDENTITY CASCADE',
  );

  // Each tag name is saved once, then shared by every product that uses it.
  const tagNames = [...new Set(products.flatMap((p) => p.tags ?? []))];
  const tags = await tagRepo.save(tagNames.map((name) => tagRepo.create({ name })));
  const tagByName = new Map(tags.map((t) => [t.name, t]));

  const rows = products.map((p) =>
    productRepo.create({
      id: p.id,
      title: p.title,
      description: p.description ?? null,
      category: p.category ?? null,
      brand: p.brand ?? null,
      sku: p.sku ?? null,
      price: p.price,
      discountPercentage: p.discountPercentage ?? 0,
      rating: p.rating ?? 0,
      stock: p.stock ?? 0,
      minimumOrderQuantity: p.minimumOrderQuantity ?? 1,
      availabilityStatus: p.availabilityStatus ?? null,
      weight: p.weight ?? null,
      dimensions: {
        width: p.dimensions?.width ?? null,
        height: p.dimensions?.height ?? null,
        depth: p.dimensions?.depth ?? null,
      },
      warrantyInformation: p.warrantyInformation ?? null,
      shippingInformation: p.shippingInformation ?? null,
      returnPolicy: p.returnPolicy ?? null,
      barcode: p.meta?.barcode ?? null,
      qrCode: p.meta?.qrCode ?? null,
      thumbnail: p.thumbnail ?? null,
      // cascade: true on the relations saves these rows together with the product
      images: (p.images ?? []).map((url, position) => ({ url, position })),
      reviews: (p.reviews ?? []).map((r) => ({
        rating: r.rating,
        comment: r.comment ?? null,
        date: new Date(r.date),
        reviewerName: r.reviewerName,
        reviewerEmail: r.reviewerEmail,
      })),
      tags: (p.tags ?? []).map((name) => tagByName.get(name)!),
      ...(p.meta && {
        createdAt: new Date(p.meta.createdAt),
        updatedAt: new Date(p.meta.updatedAt),
      }),
    }),
  );

  await productRepo.save(rows, { chunk: 50 });

  // Explicit ids don't advance the serial counter; move it past the max id
  // so products created through the API don't collide.
  await productRepo.query(
    `SELECT setval(pg_get_serial_sequence('products', 'id'), (SELECT MAX(id) FROM products))`,
  );

  console.log(`Seeded ${rows.length} products and ${tags.length} tags from ${SOURCE_URL}`);
  await app.close();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
