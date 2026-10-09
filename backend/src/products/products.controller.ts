import {
    Body, Controller, Delete, Get, HttpCode,
    Param, ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateProductDto } from './dto/create-product.dto'; // Step 7
import { QueryProductDto } from './dto/query-product.dto';
// import { UpdateProductDto } from './dto/update-product.dto'; // Step 7
import { ProductsService } from './products.service';

//Step 4: 
@ApiTags('products') //Swagger
@Controller('products')
export class ProductsController {
    constructor(private readonly productsService: ProductsService) { }

    // GET /products?limit=10&skip=0
    @Get()
    findAll(@Query() query: QueryProductDto) {
        return this.productsService.findAll(query);
    }

    // GET /products/search?q=phone   ⚠️ must be ABOVE :id *check

    // GET /products/:id
    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.productsService.findOne(id);
    }

    // GET /products

    // ---- Step 7 ---- : post patch delete
    // @Post()
    // create(@Body() dto: CreateProductDto) {
    //     return this.productsService.create(dto);
    // }
}