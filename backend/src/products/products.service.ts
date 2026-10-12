import { randomInt } from 'crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, QueryFailedError, Repository } from 'typeorm';
import { Tag } from './tag.entity';
import { CreateProductDto } from './dto/create-product.dto'; // Step 7
import { QueryProductDto } from './dto/query-product.dto';
import { UpdateProductDto } from './dto/update-product.dto'; // Step 7
import { Product } from './product.entity';

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
        const product = this.productRepo.create({
            ...fields,
            barcode: await this.generateUniqueBarcode(),
            images: images.map((url, position) => ({ url, position })),
            tags: await this.findOrCreateTags(tags),
        });

        try {
            const saved = await this.productRepo.save(product);
            return this.findOne(saved.id);
        } catch (err) {
            // 23505 = unique_violation, e.g. detail: 'Key (barcode)=(123...) already exists.'
            if (err instanceof QueryFailedError && (err as any).code === '23505') {
                const field = (err as any).detail?.match(/Key \((\w+)\)/)?.[1] ?? 'value';
                throw new ConflictException(`${field} already exists`);
            }
            throw err;
        }
    }

    // 13 random digits, e.g. "5784719087687"
    private generateBarcode(): string {
        return Array.from({ length: 13 }, () => randomInt(0, 10)).join('');
    }

    // keep generating until the db doesn't have that barcode yet
    private async generateUniqueBarcode(): Promise<string> {
        let barcode: string;
        do {
            barcode = this.generateBarcode();
        } while (await this.productRepo.existsBy({ barcode }));
        return barcode;
    }

    // string[] of tag names -> Tag[] (reuse existing tags, insert only the new ones)
    private async findOrCreateTags(names: string[]): Promise<Tag[]> {
        if (names.length === 0) return [];
        const unique = [...new Set(names)];

        // 1. find the tags that are already in the db
        const existing = await this.tagRepo.findBy({ name: In(unique) });

        // 2. create the missing ones
        const existingNames = existing.map((tag) => tag.name);
        const newTags = unique
            .filter((name) => !existingNames.includes(name))
            .map((name) => this.tagRepo.create({ name }));
        const saved = await this.tagRepo.save(newTags);

        return [...existing, ...saved];
    }
}