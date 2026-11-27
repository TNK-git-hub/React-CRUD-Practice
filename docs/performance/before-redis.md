# Stress test: before-redis

- **Date:** 2026-10-16T08:27:52.462Z
- **Git:** `migrate-redis` @ `544ade5`
- **Target:** http://localhost:3001 (production build, `node dist/main`)
- **Machine:** Apple M1, 8 cores, 16 GB RAM, darwin 24.6.0
- **Node:** v24.21.0, autocannon v8.0.0
- **Data:** 185 products in Postgres
- **Load:** 50 concurrent connections, 20s per scenario, after a 5s warm-up
- **Raw data:** `raw/before-redis-<scenario>.json`

| # | Scenario | Request | Req/sec (avg) | Latency avg (ms) | p50 (ms) | p97.5 (ms) | p99 (ms) | Max (ms) | Total requests | Errors / non-2xx |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A | List first page | `/products?limit=10&skip=0` | 2726 | 17.8 | 17 | 23 | 29 | 87 | 54515 | 0 |
| B | Search + sort | `/products?q=phone&limit=20&sortBy=price&order=desc` | 1867 | 26.3 | 26 | 31 | 35 | 116 | 37334 | 0 |
| C | Detail, same hot item | `/products/1` | 2378 | 20.5 | 20 | 26 | 30 | 149 | 47544 | 0 |
| D | Detail, random IDs | `/products/:id (random)` | 2114 | 23.1 | 23 | 27 | 32 | 95 | 42263 | 0 |

> Load generator and server share the same laptop, so treat these as relative numbers for before/after comparison, not production capacity.

Re-run: `./docs/performance/stress-test.sh before-redis http://localhost:3001`
