import {
  IsEmail, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min,
} from 'class-validator';

export class CreateReviewDto {
  @IsInt() @Min(1) @Max(5)
  rating: number;

  // non-empty after trimming: must contain at least one non-whitespace char
  @IsString() @Matches(/\S/) @MaxLength(100)
  reviewerName: string;

  @IsEmail()
  reviewerEmail: string;

  @IsOptional() @IsString() @MaxLength(1000)
  comment?: string;
}
