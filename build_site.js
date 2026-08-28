// CAGIGI static site builder
// Fetches published countries from Airtable and generates static HTML pages
// into docs/ — ready for GitHub Pages to serve directly.
//
// Reuses the same AIRTABLE_TOKEN / AIRTABLE_BASE_ID secrets already set up
// for the source monitor. Uses the Countries table only for this first
// version — pillar scores, not yet individual indicators/sources.

const { mkdir, writeFile } = require("fs/promises");

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE = "Countries";

if (!TOKEN || !BASE_ID) {
    console.error("Missing AIRTABLE_TOKEN or AIRTABLE_BASE_ID environment variable.");
    process.exit(1);
}

const API_ROOT = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`;

const PILLARS = [
    { field: "Legal Frameworks Score", label: "Legal Frameworks", color: "#B08628" },
    { field: "Institutional Enforcement Score", label: "Institutional Enforcement", color: "#2E7D8C" },
    { field: "Civil Society Signal Score", label: "Civil Society Signal", color: "#B5533D" },
    { field: "Outcome Convergence Score", label: "Outcome Convergence", color: "#4C7A56" },
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
        url.searchParams.set("filterByFormula", "{Published} = TRUE()");
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
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#FAF9F6; --surface:#FFFFFF; --border:#E7E4DC; --ink:#2A281F;
    --ink-dim:#7A776B; --ink-faint:#A6A398;
    --accent:#8C6A3F;
  }
  *{ box-sizing:border-box; }
  body{
    margin:0; background:var(--bg); color:var(--ink); min-height:100vh;
    font-family:'Inter', -apple-system, sans-serif; -webkit-font-smoothing:antialiased;
  }
  a{ color:inherit; text-decoration:none; }

  nav{
    display:flex; align-items:center; justify-content:space-between;
    padding: 1.3rem clamp(1.2rem,4vw,3.2rem);
    border-bottom: 1px solid var(--border);
  }
  .brand{ font-family:'Fraunces', Georgia, serif; font-weight:600; font-size:1.15rem; letter-spacing:-0.01em; }
  .brand span{ color: var(--accent); }
  .nav-links{ display:flex; gap:1.8rem; font-size:0.86rem; color: var(--ink-dim); }

  header.hero{ padding: 3.2rem clamp(1.2rem,4vw,3.2rem) 1rem; max-width: 900px; }
  .eyebrow{
    font-size:0.72rem; letter-spacing:0.12em; text-transform:uppercase;
    color: var(--accent); font-weight:600; margin:0 0 0.9rem;
  }
  h1{
    font-family:'Fraunces', Georgia, serif; font-weight:600; letter-spacing:-0.015em;
    font-size:clamp(1.9rem,4.2vw,3rem); line-height:1.12; margin:0 0 0.9rem;
  }
  .lede{ color:var(--ink-dim); font-size:1rem; line-height:1.65; max-width:52ch; margin:0; }

  main{ padding: 1.6rem clamp(1.2rem,4vw,3.2rem) 4rem; max-width: 1080px; }

  .stat-strip{ display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:14px; margin: 1.6rem 0 2.6rem; }
  .stat-card{
    background:var(--surface); border:1px solid var(--border); border-radius:16px;
    padding:1.2rem 1.35rem; box-shadow: 0 1px 2px rgba(30,25,10,0.03);
  }
  .stat-card .num{ font-family:'Fraunces', Georgia, serif; font-size:1.9rem; font-weight:600; }
  .stat-card .lbl{ color:var(--ink-dim); font-size:0.76rem; margin-top:0.25rem; }

  .grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:16px; }
  .card{
    background:var(--surface); border:1px solid var(--border); border-radius:18px;
    padding:1.4rem 1.5rem; box-shadow: 0 1px 2px rgba(30,25,10,0.03);
    transition: box-shadow 0.15s ease, transform 0.15s ease;
  }
  a.card:hover{ box-shadow: 0 6px 20px rgba(30,25,10,0.07); transform: translateY(-1px); }

  .card .name{ font-family:'Fraunces', Georgia, serif; font-size:1.25rem; font-weight:600; }
  .card .overall{ color:var(--ink-dim); font-size:0.8rem; margin: 0.25rem 0 1rem; }

  .pill-row{ display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; padding: 0.42rem 0; }
  .pill-row .label{ display:flex; align-items:center; color:var(--ink-dim); }
  .pill-row .dot{ width:7px; height:7px; border-radius:50%; display:inline-block; margin-right:0.5rem; flex-shrink:0; }
  .pill-row .val{ font-weight:600; color:var(--ink); font-variant-numeric: tabular-nums; }

  .bar-row{ padding: 1.05rem 0; border-top:1px solid var(--border); }
  .bar-row:first-child{ border-top:none; padding-top:0.2rem; }
  .bar-head{ display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:0.55rem; }
  .bar-head .label{ display:flex; align-items:center; color:var(--ink); font-weight:500; }
  .bar-head .dot{ width:8px; height:8px; border-radius:50%; display:inline-block; margin-right:0.55rem; }
  .bar-head .val{ font-weight:600; font-variant-numeric: tabular-nums; }
  .bar-track{ height:8px; background:#F0EEE7; border-radius:6px; overflow:hidden; }
  .bar-fill{ height:100%; border-radius:6px; }

  .back{ display:inline-flex; align-items:center; gap:0.35rem; margin-bottom:1.4rem; font-size:0.82rem; color:var(--ink-dim); }
  .back:hover{ color:var(--ink); }

  footer{ padding:1.6rem clamp(1.2rem,4vw,3.2rem); color:var(--ink-faint); font-size:0.76rem; border-top:1px solid var(--border); }
</style>
</head>
<body>
<nav>
  <div class="brand">CAGI<span>GI</span></div>
  <div class="nav-links"><a href="index.html">Countries</a></div>
</nav>
${body}
<footer>Central Asia Gender Implementation Gap Index — built from live Airtable data.</footer>
</body>
</html>`;
}

function countryCard(c) {
    const overall = fmtScore(c.fields["Overall Score"] ?? null);
    return `<a class="card" href="countries/${slugify(c.fields["countries (eng)"])}.html">
    <div class="name">${c.fields["countries (eng)"]}</div>
    <div class="overall">Overall score: ${overall}</div>
    ${PILLARS.map(p => `
      <div class="pill-row">
        <span class="label"><span class="dot" style="background:${p.color}"></span>${p.label}</span>
        <span class="val">${fmtScore(c.fields[p.field])}</span>
      </div>`).join("")}
  </a>`;
}

function countryDetailPage(c) {
    const body = `
<header class="hero">
  <p class="eyebrow">Country profile</p>
  <h1>${c.fields["countries (eng)"]}</h1>
  <p class="lede">Scores across CAGIGI's four pillars — the gap between formal gender legislation and its real-world implementation.</p>
</header>
<main>
  <a class="back" href="../index.html">&larr; All countries</a>
  <div class="card" style="max-width:640px;">
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
        <div class="bar-track"><div class="bar-fill" style="width:${width}%; background:${p.color}; opacity:${hasValue ? 1 : 0.3}"></div></div>
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
<header class="hero">
  <p class="eyebrow">CAGIGI</p>
  <h1>Central Asia Gender Implementation Gap Index</h1>
  <p class="lede">Measuring the distance between formal gender legislation and its implementation in practice, across five Central Asian countries.</p>
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
