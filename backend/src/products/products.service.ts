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
    // input: 
    async findAll({ q, limit, skip, sortBy, order }: QueryProductDto) {
        const pattern = ILike(`%${q}%`);

        // SELECT * FROM product
        // ORDER BY price DESC, id ASC.  -- 1. sort ALL rows first
        // OFFSET 0                      -- 2. then skip
        // LIMIT 10; --3. then limit

        // cần lấy full với Asc hoặc Desc trước, xong lấy array product đấy cắt đi bằng limit và skip 

        const [products, total] = await this.productRepo.findAndCount({
            where: q ? [{ title: pattern }, { description: pattern }] : undefined,
            order: sortBy
                ? { [sortBy]: order, id: 'ASC'}
                : { id: order},  // fixed: decides WHICH products are on the page
            skip,
            take: limit,
        });

        // Step 4: sort only the products on this page
        // const dir = order === 'asc' ? 1 : -1;
        // products.sort((a, b) => {
        //     const x = a[sortBy];
        //     const y = b[sortBy];
        //     const result = typeof x === 'string'
        //         ? x.localeCompare(y as string)    // title: compare text (string)
        //         : (x as number) - (y as number);  // id, price, rating, stock: compare numbers (number)
        //     return result * dir;                  // desc flips the result
        // });

        return { products, total, skip, limit };
    }

    // GET /products/search?q=...: same as findAll, but filtered by keyword.
    // q defaults to '' so the pattern becomes '%%', which matches everything

    // async search({ q = '', limit, skip }: QueryProductDto) {
    //     const pattern = ILike(`%${q}%`); // 
    //     const [products, total] = await this.productRepo.findAndCount({
    //         where: [{ title: pattern }, { description: pattern }], // where condition same to SQL
    //         order: { id: 'ASC' },
    //         take: limit,
    //         skip,\
    //     });
    //     return { products, total, skip, limit };
    // }

    // GET /products/:id: returns one product, or a 404 if it doesn't exist
    async findOne(id: number) {
    const product = await this.productRepo.findOneBy({ id });
    if (!product) throw new NotFoundException(`Product ${id} not found`);
    return product;
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