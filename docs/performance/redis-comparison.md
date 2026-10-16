# Redis: before vs after

Same machine, same script, same data (185 products), 50 connections × 20s per scenario.
Details: [before-redis.md](before-redis.md) (`544ade5`, no cache) · [after-redis.md](after-redis.md) (`5ff2f78`, Redis cache-aside).
Charts: open [redis-comparison.html](redis-comparison.html) in a browser.

| # | Scenario| Req/sec before → after | Speed-up | Latency avg before → after (ms) | p99 before → after (ms) |
|---|---|---:|---:|---:|---:|
| A | List first page | 2726 → 8917 | **3.3×** | 17.8 → 5.2 | 29 → 10 |
| B | Search + sort | 1867 → 5923 | **3.2×** | 26.3 → 7.9 | 35 → 15 |
| C | Detail, same hot item | 2378 → 15091 | **6.3×** | 20.5 → 3.1 | 30 → 5 |
| D | Detail, random IDs | 2114 → 14531 | **6.9×** | 23.1 → 3.1 | 32 → 5 |

No errors in either run.

## Why lists gain less than detail

- **2 Redis round trips per list request**: `GET products:list:version`, then `GET` the list key. Detail needs only 1.
- **Bigger payload**: 10–20 products to `JSON.parse` (Redis → object) and `JSON.stringify` again (object → HTTP response), versus 1 product.

## Why D (random IDs) is as fast as C (one hot item)

Only 185 products, so after the first ~185 requests every detail is in Redis (60s TTL). With a much bigger catalog, D would have more MISSes than C.

> Load generator and server share the same laptop: compare the ratios, not the absolute numbers.
