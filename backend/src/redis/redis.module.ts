import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

// @Global: module nào cũng inject được RedisService, ko cần import RedisModule từng chỗ
@Global()
@Module({
    providers: [RedisService],
    exports: [RedisService],
})
export class RedisModule { }
