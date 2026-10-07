import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { ProductsController } from './products.controller'; // Step 4 import here
import { ProductsService } from './products.service'; // Step 4 import here

@Module({
  imports: [TypeOrmModule.forFeature([Product])], // lets the service inject Repository<Product> *checkpoint, not really understand the "Rository"
  controllers: [ProductsController],              // handles the routes
  providers: [ProductsService],                   // can be injected into the controller

})
export class ProductsModule { }
