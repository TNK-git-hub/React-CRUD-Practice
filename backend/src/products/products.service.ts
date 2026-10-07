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

    // GET /products: returns one page of products.
    // input: limit, skip, go throu
    async findAll({ limit, skip }: QueryProductDto) {
        const [products, total] = await this.productRepo.findAndCount({
            order: { id: 'ASC' }, // stable order, so pages don't shuffle
            take: limit,          // SQL LIMIT: how many rows to return
            skip,                 // SQL OFFSET: how many rows to skip first
        });
        // total lets the frontend work out how many pages there are
        return { products, total, skip, limit };
    }

    // GET /products/search?q=...: same as findAll, but filtered by keyword.
    // q defaults to '' so the pattern becomes '%%', which matches everything
    async search({ q = '', limit, skip }: QueryProductDto) {
        const pattern = ILike(`%${q}%`); // case-insensitive LIKE
        const [products, total] = await this.productRepo.findAndCount({
            where: [{ title: pattern }, { description: pattern }], // where condition same to SQL
            order: { id: 'ASC' },
            take: limit,
            skip,
        });
        return { products, total, skip, limit };
    }

    // GET /products/:id: returns one product, or a 404 if it doesn't exist
    async findOne(id: number) {
        const product = await this.productRepo.findOneBy({ id });
        if (!product) throw new NotFoundException(`Product ${id} not found`);
        return product;
    }

    // ---- Step 7 ----

    create(dto: CreateProductDto) {
        return this.productRepo.save(this.productRepo.create(dto));
    }

    // PATCH /products/:id: update an existing product
    async update(id: number, dto: UpdateProductDto){
        const product = await this.findOne(id);
        return this.productRepo.save(this.productRepo.merge(product, dto));
    }
}