import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
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
    ) { }

    // GET /products: 
    async findAll({ q, limit, skip, sortBy, order }: QueryProductDto) {
        const pattern = ILike(`%${q}%`); // caseinsensitive search
        const [products, total] = await this.productRepo.findAndCount({
            where: q ? [{ title: pattern }, { description: pattern }] : undefined,
            order: sortBy
                ? { [sortBy]: order, id: 'ASC'}
                : { id: order},  // fixed: decides WHICH products are on the page
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
    const { images, tags, barcode, qrCode, createdAt, updatedAt, ...rest } = product;
    return {
        ...rest,
        images: images.map((img) => img.url),
        tags: tags.map((tag) => tag.name),
        meta: { barcode, qrCode, createdAt, updatedAt },
    };
}

// ---- Step 7 ----

// create(dto: CreateProductDto) {
//     return this.productRepo.save(this.productRepo.create(dto));
// }

//     // PATCH /products/:id: update an existing product
//     async update(id: number, dto: UpdateProductDto) {
//     const product = await this.findOne(id);
//     return this.productRepo.save(this.productRepo.merge(product, dto));
// }
}