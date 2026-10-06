import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from './app.module';
import { Product } from './products/product.entity';
// This file will be run by pnpm to reset to original data that was fetch fro dummyjson  
const SOURCE_URL = 'https://dummyjson.com/products?limit=0';

type DummyProduct = {
  id: number;
  title: string;
  description?: string;
  category?: string;
  brand?: string;
  price: number;
  discountPercentage?: number;
  rating?: number;
  stock?: number;
  thumbnail?: string;
  images?: string[];
  tags?: string[];
};

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const productRepo = app.get<Repository<Product>>(getRepositoryToken(Product));

  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  const { products } = (await res.json()) as { products: DummyProduct[] };

  const rows = products.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description ?? null,
    category: p.category ?? null,
    brand: p.brand ?? null,
    price: p.price,
    discountPercentage: p.discountPercentage ?? 0,
    rating: p.rating ?? 0,
    stock: p.stock ?? 0,
    thumbnail: p.thumbnail ?? null,
    images: p.images ?? [],
    tags: p.tags ?? [],
  }));

  // Upsert by id so the script is safe to re-run.
  await productRepo.upsert(rows, ['id']);

  // Explicit ids don't advance the serial counter; move it past the max id
  // so products created through the API don't collide.
  await productRepo.query(
    `SELECT setval(pg_get_serial_sequence('products', 'id'), (SELECT MAX(id) FROM products))`,
  );

  console.log(`Seeded ${rows.length} products from ${SOURCE_URL}`);
  await app.close();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
