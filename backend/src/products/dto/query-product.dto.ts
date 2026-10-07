import { Type } from 'class-transformer'; // turn type to teh proper one (number, string) when getting from query string
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
/* 
@IsString(): query param value must be a string
@IsInt(): query param value must be a integer
@IsOptional(): query param value is optional
@Max(): query param value must be less than or equal to the given value
@Min(): query param value must be greater than or equal to the given value
@Type(): query param value must be of the given type
*/

// Define type for query params  
// GET /products?q=<string>&limit=10&skip=0
export class QueryProductDto {
    @IsOptional()
    @IsString()
    q?: string;

    @IsOptional()
    @Type(() => Number) // query params arrive as strings: "10" → 10
    @IsInt()
    @Min(1)
    @Max(100)
    limit: number = 10;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    skip: number = 0;
}
