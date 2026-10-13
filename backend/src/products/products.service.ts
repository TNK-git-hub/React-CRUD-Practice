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
    ) { }

    // GET /products: 
    async findAll({ q, limit, skip, sortBy, order }: QueryProductDto) {
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

    // GET /products/:id: returns one product, or a 404 if it doesn't exist
    async findOne(id: number) {
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
                    barcode: await this.generateUniqueBarcode(),
                    images: images.map((url, position) => ({ url, position })),
                    tags: await this.findOrCreateTags(manager, tags),
                });
                const saved = await manager.save(product);
                return saved.id;
            });
            return this.findOne(id); // after the commit, so findOne can see the new row
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
        const product = await this.findOne(id); // throws 404 if not found
        await this.productRepo.delete(id);      // DB cascade removes images/reviews/product_tags
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
                }

                await manager.save(product);
            });
            return this.findOne(id); // same response shape as GET /products/:id
        } catch (err) {
            this.handleUniqueError(err);
        }
    }

}