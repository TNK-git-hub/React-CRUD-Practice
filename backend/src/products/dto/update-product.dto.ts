import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

// Same rules as Create, but every field is optional (PATCH = partial update)
export class UpdateProductDto extends PartialType(CreateProductDto) {}
