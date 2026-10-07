import {
  IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsString, Max, Min,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString()
  category?: string;

  @IsOptional() @IsString()
  brand?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  discountPercentage?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(5)
  rating?: number;

  @IsOptional() @IsInt() @Min(0)
  stock?: number;

  @IsOptional() @IsString()
  thumbnail?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  images?: string[];

  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];
}