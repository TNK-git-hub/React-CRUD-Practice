// Builds docs/drawio/project-flow.drawio from the short page summaries in pages/*.json
// and tracks which source files changed since the diagram was last synced.
//
//   node docs/drawio/build.mjs status   -> which source files changed + which pages are stale
//   node docs/drawio/build.mjs build    -> pages/*.json -> project-flow.drawio
//   node docs/drawio/build.mjs sync     -> save current source hashes into manifest.json
//
// project-flow.drawio is GENERATED: edit pages/*.json, not the .drawio file.

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, matchesGlob } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..', '..');
const MANIFEST = join(DIR, 'manifest.json');
const OUTPUT = join(DIR, 'project-flow.drawio');

// ---- style presets: pages/*.json only uses these short names ----
const BASE = 'rounded=1;whiteSpace=wrap;html=1;fontSize=12;';
const NODE_STYLES = {
    title: 'text;html=1;fontSize=20;fontStyle=1;align=left;verticalAlign=middle;',
    header: 'text;html=1;fontSize=13;fontStyle=1;align=center;verticalAlign=middle;fontColor=#555555;',
    zone: 'rounded=0;whiteSpace=wrap;html=1;fillColor=none;dashed=1;strokeColor=#999999;verticalAlign=top;align=left;spacingLeft=10;spacingTop=4;fontStyle=1;fontSize=14;',
    route: BASE + 'fillColor=#eeeeee;strokeColor=#666666;fontFamily=Courier New;',
    page: BASE + 'fillColor=#dae8fc;strokeColor=#6c8ebf;fontStyle=1;',
    component: BASE + 'fillColor=#ffffff;strokeColor=#6c8ebf;',
    hook: BASE + 'fillColor=#d5e8d4;strokeColor=#82b366;',
    api: BASE + 'fillColor=#fff2cc;strokeColor=#d6b656;',
    util: BASE + 'fillColor=#f5f5f5;strokeColor=#999999;fontColor=#333333;',
    backend: BASE + 'fillColor=#e1d5e7;strokeColor=#9673a6;',
    db: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;size=10;fontSize=12;fillColor=#f8cecc;strokeColor=#b85450;',
    table: 'rounded=0;whiteSpace=wrap;html=1;fontSize=12;align=left;verticalAlign=top;spacingLeft=8;spacingTop=4;fillColor=#ffffff;strokeColor=#b85450;',
    external: BASE + 'fillColor=#f5f5f5;strokeColor=#666666;dashed=1;',
    infra: BASE + 'fillColor=#ffe6cc;strokeColor=#d79b00;',
    note: 'shape=note;whiteSpace=wrap;html=1;size=12;fontSize=12;align=left;verticalAlign=top;spacingLeft=8;spacingTop=4;fillColor=#fffde7;strokeColor=#d6b656;',
    error: BASE + 'fillColor=#fdecea;strokeColor=#b85450;',
    todo: BASE + 'fillColor=#ffffff;strokeColor=#d32f2f;dashed=1;strokeWidth=2;fontColor=#d32f2f;fontStyle=1;',
};
const EDGE_BASE = 'edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;fontSize=11;labelBackgroundColor=#ffffff;';
const EDGE_STYLES = {
    default: EDGE_BASE + 'endArrow=block;endFill=1;',
    dashed: EDGE_BASE + 'endArrow=block;endFill=1;dashed=1;strokeColor=#777777;',
    todo: EDGE_BASE + 'endArrow=block;endFill=1;dashed=1;strokeColor=#d32f2f;fontColor=#d32f2f;',
    error: EDGE_BASE + 'endArrow=block;endFill=1;dashed=1;strokeColor=#b85450;fontColor=#b85450;',
    er1n: EDGE_BASE + 'startArrow=ERmandOne;endArrow=ERmany;startFill=0;endFill=0;',
};

// ---- helpers ----
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const escXml = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// label: "\n" -> line break, a line starting with "# " -> bold
const toHtmlLabel = (label = '') => label.split('\n')
    .map(line => line.startsWith('# ') ? `<b>${escHtml(line.slice(2))}</b>` : escHtml(line))
    .join('<br>');

// ---- build ----
function buildPage(page, file) {
    const errors = [];
    const ids = new Set();
    const cells = [];

    for (const n of page.nodes ?? []) {
        if (ids.has(n.id)) errors.push(`${file}: duplicate id "${n.id}"`);
        ids.add(n.id);
        const style = NODE_STYLES[n.style];
        if (!style) errors.push(`${file}: node "${n.id}" has unknown style "${n.style}"`);
        if (n.parent && !(page.nodes ?? []).some(p => p.id === n.parent)) errors.push(`${file}: node "${n.id}" has missing parent "${n.parent}"`);
        cells.push(`<mxCell id="${escXml(n.id)}" value="${escXml(toHtmlLabel(n.label))}" style="${escXml(style)}" vertex="1" parent="${escXml(n.parent ?? '1')}">`
            + `<mxGeometry x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" as="geometry"/></mxCell>`);
    }

    for (const e of page.edges ?? []) {
        if (ids.has(e.id)) errors.push(`${file}: duplicate id "${e.id}"`);
        ids.add(e.id);
        const style = EDGE_STYLES[e.style ?? 'default'];
        if (!style) errors.push(`${file}: edge "${e.id}" has unknown style "${e.style}"`);
        for (const end of [e.from, e.to]) {
            if (!(page.nodes ?? []).some(n => n.id === end)) errors.push(`${file}: edge "${e.id}" points to missing node "${end}"`);
        }
        cells.push(`<mxCell id="${escXml(e.id)}" value="${escXml(toHtmlLabel(e.label))}" style="${escXml(style)}" edge="1" parent="1" source="${escXml(e.from)}" target="${escXml(e.to)}">`
            + `<mxGeometry relative="1" as="geometry"/></mxCell>`);
    }

    const xml = `  <diagram id="${escXml(file)}" name="${escXml(page.name)}">\n`
        + `    <mxGraphModel grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0">\n`
        + `      <root>\n        <mxCell id="0"/>\n        <mxCell id="1" parent="0"/>\n`
        + cells.map(c => `        ${c}\n`).join('')
        + `      </root>\n    </mxGraphModel>\n  </diagram>\n`;
    return { xml, errors };
}

function build() {
    const manifest = readJson(MANIFEST);
    const results = manifest.pages.map(p => buildPage(readJson(join(DIR, p.file)), p.file));
    const errors = results.flatMap(r => r.errors);
    if (errors.length) {
        console.error('Build failed:\n  ' + errors.join('\n  '));
        process.exit(1);
    }
    writeFileSync(OUTPUT, `<mxfile host="build.mjs">\n${results.map(r => r.xml).join('')}</mxfile>\n`);
    console.log(`Built ${OUTPUT} (${results.length} pages)`);
}

// ---- change tracking ----
function currentHashes(manifest) {
    // tracked + untracked (not ignored) files that still exist on disk
    const files = execSync('git ls-files -co --exclude-standard', { cwd: ROOT, encoding: 'utf8' })
        .split('\n').filter(f => f && existsSync(join(ROOT, f)));
    const ignored = (f) => manifest.ignore.some(g => matchesGlob(f, g));
    const covered = (f) => manifest.pages.some(p => p.sources.some(g => matchesGlob(f, g)));

    const hashes = {};
    const uncovered = [];
    for (const f of files.sort()) {
        if (ignored(f)) continue;
        if (covered(f)) hashes[f] = createHash('sha1').update(readFileSync(join(ROOT, f))).digest('hex').slice(0, 12);
        else if (manifest.watch.some(g => matchesGlob(f, g))) uncovered.push(f);
    }
    return { hashes, uncovered };
}

function status() {
    const manifest = readJson(MANIFEST);
    const { hashes, uncovered } = currentHashes(manifest);
    const old = manifest.hashes ?? {};

    const changed = Object.keys(hashes).filter(f => f in old && old[f] !== hashes[f]);
    const added = Object.keys(hashes).filter(f => !(f in old));
    const deleted = Object.keys(old).filter(f => !(f in hashes));
    const touched = [...changed, ...added, ...deleted];
    const stale = manifest.pages.filter(p => touched.some(f => p.sources.some(g => matchesGlob(f, g))));

    const list = (title, items) => items.length && console.log(`${title}:\n  ${items.join('\n  ')}`);
    list('Changed', changed);
    list('New', added);
    list('Deleted', deleted);
    list('Not covered by any page (add to manifest "sources" if it matters)', uncovered);
    console.log(stale.length
        ? `Stale pages:\n  ${stale.map(p => p.file).join('\n  ')}`
        : 'Diagram is up to date.');
}

function sync() {
    const manifest = readJson(MANIFEST);
    manifest.hashes = currentHashes(manifest).hashes;
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Synced ${Object.keys(manifest.hashes).length} source hashes into manifest.json`);
}

const commands = { build, status, sync };
const cmd = process.argv[2];
if (!commands[cmd]) {
    console.error('Usage: node docs/drawio/build.mjs <status|build|sync>');
    process.exit(1);
}
commands[cmd]();
