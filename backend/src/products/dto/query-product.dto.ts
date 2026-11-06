import { Transform, Type } from 'class-transformer'; // turn type to teh proper one (number, string) when getting from query string
import {
    IsIn,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    Min,
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
} from 'class-validator';
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

export const SORTABLE_FIELDS = ['title', 'price', 'rating', 'stock'] as const;

// Number('') and Number('  ') are 0, so blank strings must become NaN to be rejected
const toPrice = ({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? NaN : value === undefined ? value : Number(value);

// minPrice must not be greater than maxPrice (only checked when both are numbers)
function IsNotGreaterThanMaxPrice(options?: ValidationOptions) {
    return (object: object, propertyName: string) => {
        registerDecorator({
            name: 'isNotGreaterThanMaxPrice',
            target: object.constructor,
            propertyName,
            options: { message: 'minPrice must not be greater than maxPrice', ...options },
            validator: {
                validate(value: unknown, args: ValidationArguments) {
                    const max = (args.object as { maxPrice?: unknown }).maxPrice;
                    if (typeof value !== 'number' || typeof max !== 'number') return true;
                    return value <= max;
                },
            },
        });
    };
}

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

    @ApiPropertyOptional({ description: 'Minimum price (inclusive)', minimum: 0 })
    @IsOptional()
    @Transform(toPrice)
    @IsNumber({ allowNaN: false, allowInfinity: false })
    @Min(0)
    @IsNotGreaterThanMaxPrice()
    minPrice?: number;

    @ApiPropertyOptional({ description: 'Maximum price (inclusive)', minimum: 0 })
    @IsOptional()
    @Transform(toPrice)
    @IsNumber({ allowNaN: false, allowInfinity: false })
    @Min(0)
    maxPrice?: number;
}
