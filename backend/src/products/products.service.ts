import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  findAll() {
    return this.productRepo.find({ order: { id: 'ASC' } });
  }

  async findOne(id: number) {
    const product = await this.productRepo.findOneBy({ id });
    if (!product) throw new NotFoundException(`Product ${id} not found`);
    return product;
  }

  create(dto: CreateProductDto) {
    return this.productRepo.save(this.productRepo.create(dto));
  }

  async update(id: number, dto: UpdateProductDto) {
    const product = await this.findOne(id);
    return this.productRepo.save(this.productRepo.merge(product, dto));
  }

  async remove(id: number) {
    const product = await this.findOne(id);
    await this.productRepo.remove(product);
  }
}
