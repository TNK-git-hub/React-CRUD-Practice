// Stress test for the read endpoints (the ones Redis will cache).
// Run through stress-test.sh, which provides autocannon without adding it as a dependency.
// Usage: node stress-test.cjs <label> <baseUrl>
const autocannon = require('autocannon');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

const label = process.argv[2] ?? 'before-redis';
const baseUrl = process.argv[3] ?? 'http://localhost:3000';
const DURATION = 20; // seconds per scenario
const CONNECTIONS = 50;
const outDir = __dirname;
const rawDir = path.join(outDir, 'raw');

async function getAllIds() {
    const ids = [];
    for (let skip = 0; ; skip += 100) {
        const res = await fetch(`${baseUrl}/products?limit=100&skip=${skip}`).then((r) => r.json());
        ids.push(...res.products.map((p) => p.id));
        if (ids.length >= res.total || res.products.length === 0) return ids;
    }
}

function run(opts) {
    return autocannon({ url: baseUrl, connections: CONNECTIONS, duration: DURATION, ...opts });
}

async function main() {
    const ids = await getAllIds();
    const randomId = () => ids[Math.floor(Math.random() * ids.length)];

    const scenarios = [
        { key: 'A', name: 'List first page', path: '/products?limit=10&skip=0' },
        { key: 'B', name: 'Search + sort', path: '/products?q=phone&limit=20&sortBy=price&order=desc' },
        { key: 'C', name: 'Detail, same hot item', path: '/products/1' },
        {
            key: 'D', name: 'Detail, random IDs', path: '/products/:id (random)',
            requests: [{ setupRequest: (req) => ({ ...req, path: `/products/${randomId()}` }) }],
        },
    ];

    console.log(`Warm-up 5s against ${baseUrl} ...`);
    await autocannon({ url: `${baseUrl}/products?limit=10`, connections: 10, duration: 5 });

    fs.mkdirSync(rawDir, { recursive: true });
    const rows = [];
    for (const s of scenarios) {
        console.log(`Scenario ${s.key}: ${s.name} (${DURATION}s, ${CONNECTIONS} connections) ...`);
        const result = await run(s.requests ? { requests: s.requests } : { url: baseUrl + s.path });
        fs.writeFileSync(path.join(rawDir, `${label}-${s.key}.json`), JSON.stringify(result, null, 2));
        rows.push({ ...s, r: result });
    }

    const commit = execSync('git rev-parse --short HEAD').toString().trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    const table = rows.map(({ key, name, path: p, r }) =>
        `| ${key} | ${name} | \`${p}\` | ${r.requests.average.toFixed(0)} | ${r.latency.average.toFixed(1)} | ${r.latency.p50} | ${r.latency.p97_5} | ${r.latency.p99} | ${r.latency.max} | ${r.requests.total} | ${r.non2xx + r.errors + r.timeouts} |`,
    ).join('\n');

    const md = `# Stress test: ${label}

- **Date:** ${new Date().toISOString()}
- **Git:** \`${branch}\` @ \`${commit}\`
- **Target:** ${baseUrl} (production build, \`node dist/main\`)
- **Machine:** ${os.cpus()[0].model}, ${os.cpus().length} cores, ${(os.totalmem() / 2 ** 30).toFixed(0)} GB RAM, ${os.platform()} ${os.release()}
- **Node:** ${process.version}, autocannon v${require('autocannon/package.json').version}
- **Data:** ${ids.length} products in Postgres
- **Load:** ${CONNECTIONS} concurrent connections, ${DURATION}s per scenario, after a 5s warm-up
- **Raw data:** \`raw/${label}-<scenario>.json\`

| # | Scenario | Request | Req/sec (avg) | Latency avg (ms) | p50 (ms) | p97.5 (ms) | p99 (ms) | Max (ms) | Total requests | Errors / non-2xx |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
${table}

> Load generator and server share the same laptop, so treat these as relative numbers for before/after comparison, not production capacity.

Re-run: \`./docs/performance/stress-test.sh ${label} ${baseUrl}\`
`;
    fs.writeFileSync(path.join(outDir, `${label}.md`), md);
    console.log('\n' + md);
}

main().catch((err) => { console.error(err); process.exit(1); });
