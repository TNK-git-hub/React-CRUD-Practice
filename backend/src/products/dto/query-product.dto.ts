import { Transform, Type } from 'class-transformer'; // turn type to teh proper one (number, string) when getting from query string
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger'; // thằng này môt tả

/* 
@IsString(): query param value must be a string
@IsIn(): query param value must be in the given array
@IsInt(): query param value must be a integer
@IsOptional(): query param value is optional
@Max(): query param value must be less than or equal to the given value
@Min(): query param value must be greater than or equal to the given value
@Type(): query param value must be of the given type
*/

// trim; an empty value means "no bound"; arrays (repeated key) are left for validation
const trimToAbsent = ({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
};

export const SORTABLE_FIELDS = ['title', 'price', 'rating', 'stock'] as const;

/* Under stand as an form templete, then validate the filled form request from client
before send to service*/
// GET /products?q=<string>&limit=10&skip=0&sortBy=<title>&order=<asc/desc>
export class QueryProductDto {
    @ApiPropertyOptional({ description: 'Description: search ' })
    @IsOptional()
    @IsString()
    q?: string;

    @ApiPropertyOptional({ description: 'Description: num of products', minimum: 1, maximum: 100 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;

    @ApiPropertyOptional({ description: 'Description: skip num of products'})
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    skip?: number = 0;

    @ApiPropertyOptional({
        description: 'Description: sort field (leave empty = sort by id)',
        enum: SORTABLE_FIELDS,
    })
    @IsOptional()
    @IsIn(SORTABLE_FIELDS)
    sortBy?: (typeof SORTABLE_FIELDS)[number];

    @ApiPropertyOptional({ description: 'Description: sort direction', enum: ['asc', 'desc'], default: 'asc' })
    @IsOptional()
    @IsIn(['asc', 'desc'])
    order?: 'asc' | 'desc' = 'asc';

    // strings on purpose (001-ADR-1): Postgres compares them as numeric(10,2), no float rounding
    @ApiPropertyOptional({ description: 'Minimum price (inclusive), decimal string, e.g. 10 or 10.50' })
    @IsOptional()
    @Transform(trimToAbsent)
    minPrice?: string;

    @ApiPropertyOptional({ description: 'Maximum price (inclusive), decimal string, e.g. 20 or 20.00' })
    @IsOptional()
    @Transform(trimToAbsent)
    maxPrice?: string;
}
