import { randomInt } from 'crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, ILike, In, QueryFailedError, Repository } from 'typeorm';
import { Tag } from './tag.entity';
import { CreateProductDto } from './dto/create-product.dto'; // Step 7
import { QueryProductDto } from './dto/query-product.dto';
import { UpdateProductDto } from './dto/update-product.dto'; // Step 7
import { Product } from './product.entity';
import { ProductImage } from './product-image.entity';
import { CacheService } from '../redis/cache.service';

// Redis cache: key của 1 product + thời gian sống (giây)
const DETAIL_TTL = 60;
const detailKey = (id: number) => `products:detail:${id}`;
type ProductDetail = Awaited<ReturnType<ProductsService['loadOne']>>;

// kèm theo data: lấy từ Redis (HIT) hay từ Postgres (MISS) -> controller gửi header X-Cache
export type CacheStatus = 'HIT' | 'MISS';

// list: mỗi bộ query (q, limit, skip, sort) = 1 key, sống 30s
// có "version" trong key: create / update / delete -> INCR version -> MỌI key list cũ bị bỏ qua 1 lần
// (ko phải tìm + xoá từng key, vì ko biết trước có bao nhiêu tổ hợp q/skip/sort), key cũ tự hết hạn sau 30s
const LIST_TTL = 30;
const LIST_VERSION_KEY = 'products:list:version';
type ProductList = Awaited<ReturnType<ProductsService['loadList']>>;

/* FLOW: Controller calls a service method -> service give TypeORM options
-> based on options, TypeORM gen query -> and vice versa
/* EXPLAIN: this service hold Type ORM method calls
then Type ORM build the actual SQL command to request values in the db*/
@Injectable()
export class ProductsService {
    // Nest creates a Repository<Product> and passes it in here.
    // "private readonly" also saves it as this.productRepo
    constructor(
        @InjectRepository(Product)
        private readonly productRepo: Repository<Product>,
        @InjectRepository(Tag)
        private readonly tagRepo: Repository<Tag>,
        private readonly dataSource: DataSource,
        private readonly cache: CacheService,
    ) { }

    // GET /products: cache-aside giống findOne, key = version + các tham số query
    //   vd products:list:v3:{"q":"phone","limit":20,"skip":0,"sortBy":"price","order":"desc"}
    async findAll(query: QueryProductDto) {
        const version = (await this.cache.get<number>(LIST_VERSION_KEY)) ?? 0; // chưa có / Redis tắt -> 0
        const { q, limit, skip, sortBy, order } = query;
        const key = `products:list:v${version}:${JSON.stringify({ q, limit, skip, sortBy, order })}`;

        const cached = await this.cache.get<ProductList>(key);
        if (cached) return { data: cached, cache: 'HIT' as CacheStatus };

        const list = await this.loadList(query);
        await this.cache.set(key, list, LIST_TTL);
        return { data: list, cache: 'MISS' as CacheStatus };
    }

    // data trong list đổi (thêm / sửa / xoá product) -> lên version mới
    private invalidateLists() {
        return this.cache.incr(LIST_VERSION_KEY);
    }

    private async loadList({ q, limit, skip, sortBy, order }: QueryProductDto) {
        const pattern = ILike(`%${q}%`); // caseinsensitive search
        const [products, total] = await this.productRepo.findAndCount({
            where: q ? [{ title: pattern }, { description: pattern }] : undefined,
            order: sortBy
                ? { [sortBy]: order, id: 'ASC' }
                : { id: order },  // fixed: decides WHICH products are on the page
            skip,
            take: limit,
        });
        return { products, total, skip, limit };
    }

    // GET /products/:id: cache-aside
    //   có trong Redis (HIT) -> trả luôn, ko đụng Postgres
    //   ko có (MISS) -> đọc Postgres -> lưu Redis 60s -> trả
    // 404 throw trong loadOne -> ko bao giờ cache "ko tồn tại"
    async findOne(id: number) {
        const cached = await this.cache.get<ProductDetail>(detailKey(id));
        if (cached) return { data: cached, cache: 'HIT' as CacheStatus };

        const product = await this.loadOne(id);
        await this.cache.set(detailKey(id), product, DETAIL_TTL);
        return { data: product, cache: 'MISS' as CacheStatus };
    }

    // đọc thẳng Postgres, ko qua cache: create / update / remove dùng hàm này
    // (nếu dùng findOne, update sẽ trả về bản CŨ còn nằm trong cache)
    private async loadOne(id: number) {
        const product = await this.productRepo.findOne({
            where: { id },
            relations: { images: true, reviews: true, tags: true }, // JOIN 3 bảng productImage, review, tag để cho vào đây
            order: { images: { position: 'ASC' }, reviews: { id: 'ASC' } },
        });
        if (!product) throw new NotFoundException(`Product ${id} not found`);

        // đổi về dạng giống dummyjson để frontend không phải sửa
        const p = product;
        return {
            id: p.id,
            title: p.title,
            description: p.description,
            category: p.category,
            brand: p.brand,
            tags: p.tags.map((tag) => tag.name),
            price: p.price,
            discountPercentage: p.discountPercentage,
            stock: p.stock,
            minimumOrderQuantity: p.minimumOrderQuantity,
            availabilityStatus: p.availabilityStatus,
            sku: p.sku,
            weight: p.weight,
            dimensions: p.dimensions,
            warrantyInformation: p.warrantyInformation,
            shippingInformation: p.shippingInformation,
            returnPolicy: p.returnPolicy,
            images: p.images.map((img) => img.url),
            thumbnail: p.thumbnail,
            rating: p.rating,
            reviewCount: p.reviewCount,
            reviews: p.reviews,
            meta: { barcode: p.barcode, qrCode: p.qrCode, createdAt: p.createdAt, updatedAt: p.updatedAt },
        };
    }

    // ---- Step 7 ----

    // POST /products: create a new product
    async create(dto: CreateProductDto) {
        const { images = [], tags = [], ...fields } = dto;
        try {
            // everything inside runs in one transaction: if any step fails, nothing is saved
            const id = await this.dataSource.transaction(async (manager) => {
                const product = manager.create(Product, {
                    ...fields,
                    thumbnail: fields.thumbnail ?? images[0] ?? null,   // NEW: first image = thumbnail
                    barcode: await this.generateUniqueBarcode(),
                    images: images.map((url, position) => ({ url, position })),
                    tags: await this.findOrCreateTags(manager, tags),
                });
                const saved = await manager.save(product);
                return saved.id;
            });
            await this.invalidateLists(); // list có thêm 1 product
            return this.loadOne(id); // after the commit, so loadOne can see the new row
        } catch (err) {
            this.handleUniqueError(err);
        }
    }

    // 23505 = unique_violation, e.g. detail: 'Key (sku)=(ABC) already exists.'
    // turns the db error into a 409 Conflict; any other error is re-thrown as is
    private handleUniqueError(err: unknown): never {
        if (err instanceof QueryFailedError && (err as any).code === '23505') {
            const field = (err as any).detail?.match(/Key \((\w+)\)/)?.[1] ?? 'value';
            throw new ConflictException(`${field} already exists`);
        }
        throw err;
    }


    // 13 random digits, e.g. "5784719087687" -- when create a product, gen a new barcode
    private generateBarcode(): string {
        return Array.from({ length: 13 }, () => randomInt(0, 10)).join('');
    }

    // keep generating until the db doesn't have that barcode yet -- check the gen until the barcode is unique
    private async generateUniqueBarcode(): Promise<string> {
        let barcode: string;
        do {
            barcode = this.generateBarcode();
        } while (await this.productRepo.existsBy({ barcode }));
        return barcode;
    }

    // string[] of tag names -> Tag[] (reuse existing tags, insert only the new ones)
    private async findOrCreateTags(manager: EntityManager, names: string[]): Promise<Tag[]> {
        if (names.length === 0) return [];
        const unique = [...new Set(names)];

        // 1. find the tags that are already in the db
        const existing = await manager.findBy(Tag, { name: In(unique) });          // 👈 changed

        // 2. create the missing ones
        const existingNames = existing.map((tag) => tag.name);
        const newTags = unique
            .filter((name) => !existingNames.includes(name))
            .map((name) => manager.create(Tag, { name }));                         // 👈 changed
        const saved = await manager.save(newTags);                                 // 👈 changed

        return [...existing, ...saved];
    }


    // DELETE /products/:id
    async remove(id: number) {
        const product = await this.loadOne(id); // throws 404 if not found (ko lấy từ cache: có thể đã cũ)
        await this.productRepo.delete(id);      // DB cascade removes images/reviews/product_tags
        await this.cache.del(detailKey(id));    // xoá khỏi cache, ko thì GET /products/:id vẫn trả về 60s nữa
        await this.invalidateLists();           // list bớt 1 product
        return { ...product, isDeleted: true, deletedOn: new Date().toISOString() };
    }

    // PATCH /products/:id: only change the fields that were sent
    async update(id: number, dto: UpdateProductDto) {
        const { images, tags, dimensions, ...fields } = dto;
        try {
            await this.dataSource.transaction(async (manager) => {
                const product = await manager.findOneBy(Product, { id });
                if (!product) throw new NotFoundException(`Product ${id} not found`);

                Object.assign(product, fields); // plain columns: title, price, sku...

                // merge, so { width: 5 } doesn't wipe height/depth
                if (dimensions) product.dimensions = { ...product.dimensions, ...dimensions };

                // replace the whole tag list (reuses existing tags)
                if (tags) product.tags = await this.findOrCreateTags(manager, tags);

                // replace the whole image list: delete old rows, then add the new ones
                if (images) {
                    await manager.delete(ProductImage, { product: { id } });
                    product.images = images.map((url, position) =>
                        manager.create(ProductImage, { url, position }));
                    // same rule as create: first image = thumbnail (unless a thumbnail was sent)
                    product.thumbnail = fields.thumbnail ?? images[0] ?? null;
                }

                await manager.save(product);
            });
            await this.cache.del(detailKey(id)); // sau commit: xoá bản cũ, GET kế tiếp đọc lại Postgres
            await this.invalidateLists();        // title / price... trong list có thể đã đổi
            return this.loadOne(id); // same response shape as GET /products/:id
        } catch (err) {
            this.handleUniqueError(err);
        }
    }

}