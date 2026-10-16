import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

/* EXPLAIN: lớp mỏng trên Redis cho cache: lưu object dưới dạng JSON string + thời gian sống (TTL)
   Mọi hàm đều fail-open: Redis tắt / lỗi -> get trả undefined (= MISS), set/del bỏ qua
   -> code gọi chỉ cần "ko có trong cache thì đọc Postgres", ko phải try/catch */
@Injectable()
export class CacheService {
    private readonly logger = new Logger(CacheService.name);

    constructor(private readonly redis: RedisService) { }

    // GET key -> object, hoặc undefined nếu ko có / hết hạn / Redis tắt
    async get<T>(key: string): Promise<T | undefined> {
        if (!this.redis.isReady) return undefined;
        try {
            const json = await this.redis.client.get(key);
            return json === null ? undefined : (JSON.parse(json) as T);
        } catch (err) {
            this.logger.warn(`get ${key} failed: ${(err as Error).message}`);
            return undefined;
        }
    }

    // SET key json EX ttl -> Redis tự xoá key sau ttl giây
    async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
        if (!this.redis.isReady) return;
        try {
            await this.redis.client.set(key, JSON.stringify(value), { expiration: { type: 'EX', value: ttlSeconds } });
        } catch (err) {
            this.logger.warn(`set ${key} failed: ${(err as Error).message}`);
        }
    }

    // DEL key1 key2... -> dùng khi data trong Postgres đổi (update / delete)
    async del(...keys: string[]): Promise<void> {
        if (!this.redis.isReady || keys.length === 0) return;
        try {
            await this.redis.client.del(keys);
        } catch (err) {
            this.logger.warn(`del ${keys.join(' ')} failed: ${(err as Error).message}`);
        }
    }

    // INCR key -> số mới (key chưa có thì coi như 0 -> 1). Dùng cho "version" của cache list
    async incr(key: string): Promise<number | undefined> {
        if (!this.redis.isReady) return undefined;
        try {
            return await this.redis.client.incr(key);
        } catch (err) {
            this.logger.warn(`incr ${key} failed: ${(err as Error).message}`);
            return undefined;
        }
    }
}
