import { Type } from 'class-transformer'; // turn type to teh proper one (number, string) when getting from query string
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
/* 
@IsString(): query param value must be a string
@IsIn(): query param value must be in the given array
@IsInt(): query param value must be a integer
@IsOptional(): query param value is optional
@Max(): query param value must be less than or equal to the given value
@Min(): query param value must be greater than or equal to the given value
@Type(): query param value must be of the given type
*/

export const SORTABLE_FIELDS = ['title', 'price', 'rating', 'stock'] as const;

/* Under stand as an form templete, then validate the filled form request from client
before send to service*/
// GET /products?q=<string>&limit=10&skip=0&sortBy=<title>&order=<asc/desc>
export class QueryProductDto {
    @IsOptional()
    @IsString()
    q?: string;

    @IsOptional()
    @Type(() => Number) 
    @IsInt()
    @Min(1)
    @Max(100)
    limit: number = 10;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    skip: number = 0;

    @IsOptional()
    @IsIn(SORTABLE_FIELDS)
    sortBy: (typeof SORTABLE_FIELDS)[number];

    @IsOptional()
    @IsIn(['asc', 'desc'])
    order: 'asc' | 'desc' = 'asc';
}
