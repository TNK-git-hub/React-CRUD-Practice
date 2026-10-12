import { Type } from 'class-transformer';
import {
  IsArray, IsInt, IsNotEmpty, IsNumber, IsNumberString, IsOptional,
  IsString, Length, Max, Min, ValidateNested
} from 'class-validator';

// nested object { width, height, depth } -> saved into the embedded Dimensions columns
export class DimensionsDto {
  @IsNumber() @Min(0) width: number;
  @IsNumber() @Min(0) height: number;
  @IsNumber() @Min(0) depth: number;
}

export class CreateProductDto {
  // ---- required ----
  @IsString() @IsNotEmpty()
  title: string;

  @IsString() @IsNotEmpty()
  description: string;

  @IsString() @IsNotEmpty()
  category: string;

  @IsString() @IsNotEmpty()
  brand: string;

  @IsArray() @IsString({ each: true })
  tags: string[];

  @IsNumber() @Min(0)
  price: number;

  @IsNumber() @Min(0) @Max(100)
  discountPercentage: number;

  @IsInt() @Min(0)
  stock: number;

  @IsInt() @Min(1)
  minimumOrderQuantity: number;

  @IsString() @IsNotEmpty()
  availabilityStatus: string;

  @IsString() @IsNotEmpty()
  sku: string;

  @IsNumber() @Min(0)
  weight: number;

  @ValidateNested()          // also validate the fields inside the object
  @Type(() => DimensionsDto) // turn the plain JSON object into a DimensionsDto first
  dimensions: DimensionsDto;

  @IsString() @IsNotEmpty()
  warrantyInformation: string;

  @IsString() @IsNotEmpty()
  shippingInformation: string;

  @IsString() @IsNotEmpty()
  returnPolicy: string;

  @IsNumberString() @Length(13, 13)   // dummyjson barcodes are 13 digits, e.g. "5784719087687"
  barcode: string;

  @IsArray() @IsString({ each: true })
  images: string[];

  // ---- optional ----
  @IsOptional() @IsString()
  thumbnail?: string;
}
