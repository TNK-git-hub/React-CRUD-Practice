import {
    Body, Controller, Delete, Get, HttpCode,
    Param, ParseIntPipe, Patch, Post, Query, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { CreateProductDto } from './dto/create-product.dto'; // Step 7
import { QueryProductDto } from './dto/query-product.dto';
import { UpdateProductDto } from './dto/update-product.dto'; // Step 7
import { ProductsService } from './products.service';

//Step 4: 
@ApiTags('products') //Swagger
@Controller('products')
export class ProductsController {
    constructor(private readonly productsService: ProductsService) { }

    // GET /products?limit=10&skip=0
    // X-Cache: HIT (từ Redis) / MISS (từ Postgres) -> xem ở DevTools > Network > Headers
    // passthrough: true -> vẫn return data như bình thường, chỉ mượn res để thêm header
    @Get()
    async findAll(@Query() query: QueryProductDto, @Res({ passthrough: true }) res: Response) {
        const { data, cache } = await this.productsService.findAll(query);
        res.setHeader('X-Cache', cache);
        return data;
    }

    // GET /products/:id
    @Get(':id')
    async findOne(@Param('id', ParseIntPipe) id: number, @Res({ passthrough: true }) res: Response) {
        const { data, cache } = await this.productsService.findOne(id);
        res.setHeader('X-Cache', cache);
        return data;
    }

    // ---- Step 7 ---- : post patch delete
    // POST /products/add
    @Post('add')
    create(@Body() dto: CreateProductDto) {
        return this.productsService.create(dto);
    }

    // DELETE /products/:id
    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.productsService.remove(id);
    }

    // PATCH /products/:id
    @Patch(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
        return this.productsService.update(id, dto);
    }
}