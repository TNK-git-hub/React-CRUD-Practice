import { Transform } from 'class-transformer';
import {
  IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';

export class CreateReviewDto {
  @IsInt() @Min(1) @Max(5)
  rating: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @IsNotEmpty() @MaxLength(100)
  reviewerName: string;

  @IsEmail()
  reviewerEmail: string;

  @IsOptional() @IsString() @MaxLength(1000)
  comment?: string;
}
