import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

/* EXPLAIN: giữ 1 kết nối Redis dùng chung cho cả app (Nest tạo 1 instance duy nhất)
   Redis chỉ là cache -> Redis tắt thì app VẪN chạy, chỉ là đọc thẳng Postgres (fail-open) */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    private isDown = false; // log lỗi 1 lần mỗi lần mất kết nối, ko spam mỗi lần thử lại

    readonly client: ReturnType<typeof createClient>;

    constructor(config: ConfigService) {
        this.client = createClient({
            url: config.get('REDIS_URL') ?? 'redis://localhost:6379',
            // mặc định: mất kết nối thì lệnh xếp hàng chờ -> request treo tới khi Redis sống lại
            // true: báo lỗi ngay -> code gọi Postgres luôn
            disableOfflineQueue: true,
            socket: {
                connectTimeout: 2000,
                reconnectStrategy: (retries) => Math.min(retries * 500, 5000), // thử lại sau 0.5s, 1s... tối đa 5s, ko bỏ cuộc
            },
        });

        // bắt buộc lắng nghe 'error': ko có listener thì lỗi kết nối làm crash cả process
        this.client.on('error', (err: Error) => {
            if (this.isDown) return;
            this.isDown = true;
            // ECONNREFUSED đến dưới dạng AggregateError có message rỗng -> lấy code
            const reason = err.message || (err as NodeJS.ErrnoException).code || err.name;
            this.logger.warn(`Redis unavailable (${reason}) -> reading from Postgres until it's back`);
        });
        this.client.on('ready', () => {
            this.isDown = false;
            this.logger.log('Redis connected');
        });
    }

    // Nest gọi khi app khởi động. Ko await: Redis chưa chạy thì app vẫn lên, client tự kết nối lại sau
    onModuleInit() {
        this.client.connect().catch(() => { /* đã log ở 'error' */ });
    }

    // Nest gọi khi app tắt (Ctrl+C, cần enableShutdownHooks): chờ lệnh đang chạy xong rồi đóng
    async onModuleDestroy() {
        if (this.client.isOpen) await this.client.close();
    }

    get isReady() {
        return this.client.isReady;
    }
}
