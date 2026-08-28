// CAGIGI static site builder
// Fetches published countries from Airtable and generates static HTML pages
// into docs/ — ready for GitHub Pages to serve directly.
//
// Reuses the same AIRTABLE_TOKEN / AIRTABLE_BASE_ID secrets already set up
// for the source monitor. Uses the Countries table only for this first
// version — pillar scores, not yet individual indicators/sources.

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE = "Countries";

if (!TOKEN || !BASE_ID) {
    console.error("Missing AIRTABLE_TOKEN or AIRTABLE_BASE_ID environment variable.");
    process.exit(1);
}

const { mkdir, writeFile } = require("fs/promises");

const API_ROOT = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`;

const PILLARS = [
    { field: "Legal Frameworks Score", label: "Legal Frameworks", color: "#C9A227" },
    { field: "Institutional Enforcement Score", label: "Institutional Enforcement", color: "#3E8C9A" },
    { field: "Civil Society Signal Score", label: "Civil Society Signal", color: "#A6432F" },
    { field: "Outcome Convergence Score", label: "Outcome Convergence", color: "#6B8F71" },
];

function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function fmtScore(v) {
    const n = Number(v);
    if (v === undefined || v === null || v === "" || Number.isNaN(n)) return "—";
    return n.toFixed(1);
}

async function listAllRecords() {
    let records = [];
    let offset;
    do {
        const url = new URL(API_ROOT);
        url.searchParams.set(
            "filterByFormula",
            "{Published} = TRUE()"
        );
        if (offset) url.searchParams.set("offset", offset);
        const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
        if (!res.ok) throw new Error(`Failed to list records: ${res.status} ${await res.text()}`);
        const data = await res.json();
        records = records.concat(data.records);
        offset = data.offset;
    } while (offset);
    return records;
}

function pageShell(title, body) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — CAGIGI</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{ --bg:#12141B; --bg-2:#191C25; --ink:#EDE9DF; --ink-dim:#8B8A85; --line:#2A2D38; }
  *{ box-sizing:border-box; }
  body{
    margin:0; background:var(--bg); color:var(--ink); min-height:100vh;
    font-family:'JetBrains Mono', ui-monospace, Menlo, monospace;
  }
  a{ color:inherit; text-decoration:none; }
  header{ padding:2.2rem clamp(1rem,4vw,3rem) 1rem; border-bottom:1px solid var(--line); }
  .eyebrow{ font-size:0.7rem; letter-spacing:0.14em; text-transform:uppercase; color:var(--ink-dim); margin:0 0 0.5rem; }
  h1{ font-family:'Fraunces', Georgia, serif; font-weight:500; font-size:clamp(1.4rem,3vw,2.1rem); margin:0; }
  main{ padding: 1.6rem clamp(1rem,4vw,3rem) 3rem; max-width: 980px; }
  .grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:12px; margin-top:1.4rem; }
  .card{
    background:var(--bg-2); border:1px solid var(--line); border-radius:10px;
    padding:1.1rem 1.2rem; transition: border-color 0.15s ease;
  }
  .card:hover{ border-color:#454A5C; }
  .card .name{ font-family:'Fraunces', Georgia, serif; font-size:1.15rem; font-weight:500; }
  .card .overall{ color:var(--ink-dim); font-size:0.78rem; margin-top:0.3rem; }
  .pillar-row{
    display:flex; justify-content:space-between; align-items:center;
    font-size:0.74rem; padding:0.5rem 0; border-top:1px solid var(--line);
  }
  .pillar-row .dot{ width:7px; height:7px; border-radius:50%; display:inline-block; margin-right:0.5rem; }
  .pillar-row .label{ color:var(--ink-dim); display:flex; align-items:center; }
  .stat-strip{ display:flex; gap:12px; flex-wrap:wrap; margin-top:1.4rem; }
  .stat-card{
    background:var(--bg-2); border:1px solid var(--line); border-radius:10px;
    padding:1rem 1.3rem; min-width:150px;
  }
  .stat-card .num{ font-family:'Fraunces', Georgia, serif; font-size:1.8rem; font-weight:500; }
  .stat-card .lbl{ color:var(--ink-dim); font-size:0.68rem; letter-spacing:0.08em; text-transform:uppercase; margin-top:0.2rem; }
  .bar-row{ padding:0.9rem 0; border-top:1px solid var(--line); }
  .bar-row:first-child{ border-top:none; }
  .bar-head{ display:flex; justify-content:space-between; font-size:0.78rem; margin-bottom:0.5rem; }
  .bar-head .label{ display:flex; align-items:center; color:var(--ink-dim); }
  .bar-head .dot{ width:7px; height:7px; border-radius:50%; display:inline-block; margin-right:0.5rem; }
  .bar-head .val{ font-size:0.95rem; color:var(--ink); }
  .bar-track{ height:6px; background:var(--line); border-radius:4px; overflow:hidden; }
  .bar-fill{ height:100%; border-radius:4px; }
  .back{ display:inline-block; margin-bottom:1.2rem; font-size:0.75rem; color:var(--ink-dim); }
  footer{ padding:1.5rem clamp(1rem,4vw,3rem); color:var(--ink-dim); font-size:0.68rem; border-top:1px solid var(--line); }
</style>
</head>
<body>
${body}
<footer>Central Asia Gender Implementation Gap Index — built from live Airtable data.</footer>
</body>
</html>`;
}

function countryCard(c) {
    const overall = fmtScore(c.fields["Overall Score"] ?? null);
    return `<a class="card" href="countries/${slugify(c.fields["countries (eng)"])}.html">
    <div class="name">${c.fields["countries (eng)"]}</div>
    <div class="overall">Overall: ${overall}</div>
    ${PILLARS.map(p => `
      <div class="pillar-row">
        <span class="label"><span class="dot" style="background:${p.color}"></span>${p.label}</span>
        <span>${fmtScore(c.fields[p.field])}</span>
      </div>`).join("")}
  </a>`;
}

function countryDetailPage(c) {
    const body = `
<header>
  <p class="eyebrow">CAGIGI — Central Asia Gender Implementation Gap Index</p>
  <h1>${c.fields["countries (eng)"]}</h1>
</header>
<main>
  <a class="back" href="../index.html">&larr; All countries</a>
  <div class="card">
    ${PILLARS.map(p => {
        const raw = c.fields[p.field];
        const num = Number(raw);
        const hasValue = raw !== undefined && raw !== null && raw !== "" && !Number.isNaN(num);
        const width = hasValue ? Math.max(0, Math.min(100, num)) : 0;
        return `
      <div class="bar-row">
        <div class="bar-head">
          <span class="label"><span class="dot" style="background:${p.color}"></span>${p.label}</span>
          <span class="val">${fmtScore(raw)}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${width}%; background:${p.color}; opacity:${hasValue ? 1 : 0.25}"></div></div>
      </div>`;
    }).join("")}
  </div>
</main>`;
    return pageShell(c.fields["countries (eng)"], body);
}

function indexPage(countries) {
    const scoredCounts = PILLARS.map(p => {
        const withData = countries.filter(c => {
            const n = Number(c.fields[p.field]);
            return c.fields[p.field] !== undefined && c.fields[p.field] !== "" && !Number.isNaN(n);
        }).length;
        return { label: p.label, count: withData };
    });
    const body = `
<header>
  <p class="eyebrow">CAGIGI</p>
  <h1>Central Asia Gender Implementation Gap Index</h1>
</header>
<main>
  <div class="stat-strip">
    <div class="stat-card"><div class="num">${countries.length}</div><div class="lbl">Countries published</div></div>
    ${scoredCounts.map(s => `<div class="stat-card"><div class="num">${s.count}/${countries.length}</div><div class="lbl">${s.label} scored</div></div>`).join("")}
  </div>
  <div class="grid">
    ${countries.map(countryCard).join("")}
  </div>
</main>`;
    return pageShell("Countries", body);
}

async function main() {
    const records = await listAllRecords();
    console.log(`Found ${records.length} published countr${records.length === 1 ? "y" : "ies"}.`);

    await mkdir("docs/countries", { recursive: true });
    await writeFile("docs/index.html", indexPage(records));

    for (const c of records) {
        const slug = slugify(c.fields["countries (eng)"]);
        await writeFile(`docs/countries/${slug}.html`, countryDetailPage(c));
        console.log(`Built docs/countries/${slug}.html`);
    }

    console.log("Site build complete.");
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
