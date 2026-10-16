import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { CacheService } from './cache.service';

// @Global: module nào cũng inject được RedisService, ko cần import RedisModule từng chỗ
@Global()
@Module({
    providers: [RedisService, CacheService],
    exports: [RedisService, CacheService],
})
export class RedisModule { }
