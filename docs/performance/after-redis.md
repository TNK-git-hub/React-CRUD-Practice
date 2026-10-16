# Stress test: after-redis

- **Date:** 2026-10-16T08:46:23.041Z
- **Git:** `migrate-redis` @ `5ff2f78`
- **Target:** http://localhost:3001 (production build, `node dist/main`)
- **Machine:** Apple M1, 8 cores, 16 GB RAM, darwin 24.6.0
- **Node:** v24.21.0, autocannon v8.0.0
- **Data:** 185 products in Postgres
- **Load:** 50 concurrent connections, 20s per scenario, after a 5s warm-up
- **Raw data:** `raw/after-redis-<scenario>.json`

| # | Scenario | Request | Req/sec (avg) | Latency avg (ms) | p50 (ms) | p97.5 (ms) | p99 (ms) | Max (ms) | Total requests | Errors / non-2xx |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A | List first page | `/products?limit=10&skip=0` | 8917 | 5.2 | 5 | 6 | 10 | 21 | 178333 | 0 |
| B | Search + sort | `/products?q=phone&limit=20&sortBy=price&order=desc` | 5923 | 7.9 | 8 | 11 | 15 | 73 | 118442 | 0 |
| C | Detail, same hot item | `/products/1` | 15091 | 3.1 | 3 | 4 | 5 | 69 | 301804 | 0 |
| D | Detail, random IDs | `/products/:id (random)` | 14531 | 3.1 | 3 | 4 | 5 | 73 | 290611 | 0 |

> Load generator and server share the same laptop, so treat these as relative numbers for before/after comparison, not production capacity.

Re-run: `./docs/performance/stress-test.sh after-redis http://localhost:3001`
