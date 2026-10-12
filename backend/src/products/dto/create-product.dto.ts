import { Type } from 'class-transformer';
import {
  IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsString, Max, Min, ValidateNested
} from 'class-validator';

// nested object { width, height, depth } -> saved into the embedded Dimensions columns
export class DimensionsDto {
  @IsOptional() @IsNumber() @Min(0) width?: number;
  @IsOptional() @IsNumber() @Min(0) height?: number;
  @IsOptional() @IsNumber() @Min(0) depth?: number;
}

export class CreateProductDto {
  // ---- required ----
  @IsString() @IsNotEmpty()
  title: string;

  @IsString() @IsNotEmpty()
  description: string;

  @IsString() @IsNotEmpty()
  category: string;

  @IsOptional() @IsString() @IsNotEmpty()
  brand: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  tags: string[];

  @IsNumber() @Min(0)
  price: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  discountPercentage: number = 0;

  @IsInt() @Min(0)
  stock: number;

  @IsOptional() @IsInt() @Min(1)
  minimumOrderQuantity: number;

  @IsOptional() @IsString() @IsNotEmpty()
  availabilityStatus: string;

  @IsOptional() @IsString() @IsNotEmpty()
  sku: string;

  @IsOptional() @IsNumber() @Min(0)
  weight: number;

  @IsOptional() 
  @ValidateNested()          // also validate the fields inside the object
  @Type(() => DimensionsDto) // turn the plain JSON object into a DimensionsDto first
  dimensions: DimensionsDto;

  @IsOptional() @IsString() @IsNotEmpty()
  warrantyInformation: string;

  @IsOptional() @IsString() @IsNotEmpty()
  shippingInformation: string;

  @IsOptional() @IsString() @IsNotEmpty()
  returnPolicy: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  images: string[];

  // ---- optional ----
  @IsOptional() @IsString()
  thumbnail?: string;
}
