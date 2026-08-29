// CAGIGI static site builder
// Fetches published countries from Airtable and generates static HTML pages
// into docs/ — ready for GitHub Pages to serve directly.

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
    { field: "Legal Frameworks Score", label: "Legal Frameworks", short: "Legal", color: "#C08A2E" },
    { field: "Institutional Enforcement Score", label: "Institutional Enforcement", short: "Institutional", color: "#2B8C99" },
    { field: "Civil Society Signal Score", label: "Civil Society Signal", short: "Civil Society", color: "#C25B42" },
    { field: "Outcome Convergence Score", label: "Outcome Convergence", short: "Outcome", color: "#4F8B5E" },
];

function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function fmtScore(v) {
    const n = Number(v);
    if (v === undefined || v === null || v === "" || Number.isNaN(n)) return null;
    return n;
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

// Circular gauge — value 0-100, null renders an empty dashed ring.
function ringGauge(value, color, size = 84, strokeWidth = 8) {
    const r = (size - strokeWidth) / 2;
    const c = 2 * Math.PI * r;
    const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
    const offset = c - (pct / 100) * c;
    const display = value === null ? "—" : Math.round(value);
    return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#EDEAE1" stroke-width="${strokeWidth}"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${value === null ? '#D8D4C8' : color}"
        stroke-width="${strokeWidth}" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${value === null ? c * 0.97 : offset}"/>
    </svg>
    <div class="ring-label" style="width:${size}px;">${display}</div>`;
}

function pageShell(title, body) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — CAGIGI</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#FAF9F5; --surface:#FFFFFF; --border:#E9E6DD; --ink:#232116;
    --ink-dim:#7B7869; --ink-faint:#A9A695; --accent:#8C6A3F;
  }
  *{ box-sizing:border-box; }
  body{
    margin:0; background:var(--bg); color:var(--ink); min-height:100vh;
    font-family:'Manrope', -apple-system, sans-serif; -webkit-font-smoothing:antialiased;
  }
  a{ color:inherit; text-decoration:none; }

  nav{ display:flex; align-items:center; justify-content:space-between; padding: 1.3rem clamp(1.2rem,4vw,3.2rem); border-bottom: 1px solid var(--border); }
  .brand{ font-weight:800; font-size:1.05rem; letter-spacing:-0.01em; }
  .brand span{ color: var(--accent); }
  .nav-links{ font-size:0.86rem; color: var(--ink-dim); }

  header.hero{ padding: 3rem clamp(1.2rem,4vw,3.2rem) 1rem; max-width: 860px; }
  .eyebrow{ font-size:0.72rem; letter-spacing:0.1em; text-transform:uppercase; color: var(--accent); font-weight:700; margin:0 0 0.7rem; }
  h1{ font-weight:800; letter-spacing:-0.02em; font-size:clamp(1.7rem,3.6vw,2.5rem); line-height:1.15; margin:0 0 0.8rem; }
  .lede{ color:var(--ink-dim); font-size:0.98rem; line-height:1.6; max-width:52ch; margin:0; font-weight:500; }

  main{ padding: 1.6rem clamp(1.2rem,4vw,3.2rem) 4rem; max-width: 1080px; }

  .stat-strip{ display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:14px; margin: 1.6rem 0 2.6rem; }
  .stat-card{ background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:1.15rem 1.3rem; box-shadow: 0 1px 2px rgba(30,25,10,0.03); }
  .stat-card .num{ font-size:1.85rem; font-weight:800; letter-spacing:-0.02em; }
  .stat-card .lbl{ color:var(--ink-dim); font-size:0.75rem; margin-top:0.2rem; font-weight:600; }

  .grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:16px; }
  .card{ background:var(--surface); border:1px solid var(--border); border-radius:18px; padding:1.4rem 1.5rem; box-shadow: 0 1px 2px rgba(30,25,10,0.03); transition: box-shadow 0.15s ease, transform 0.15s ease; }
  a.card:hover{ box-shadow: 0 6px 20px rgba(30,25,10,0.07); transform: translateY(-1px); }
  .card .name{ font-weight:800; font-size:1.15rem; letter-spacing:-0.01em; }
  .card .overall{ color:var(--ink-dim); font-size:0.8rem; margin: 0.2rem 0 1.1rem; font-weight:600; }

  .ring-grid{ display:grid; grid-template-columns:repeat(4,1fr); gap:10px; text-align:center; }
  .ring-item{ display:flex; flex-direction:column; align-items:center; }
  .ring-wrap{ position:relative; }
  .ring-label{ position:absolute; top:0; left:0; height:100%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.05rem; }
  .ring-name{ font-size:0.68rem; color:var(--ink-dim); font-weight:600; margin-top:0.5rem; line-height:1.3; }

  .back{ display:inline-flex; align-items:center; gap:0.35rem; margin-bottom:1.4rem; font-size:0.82rem; color:var(--ink-dim); font-weight:600; }
  .back:hover{ color:var(--ink); }

  footer{ padding:1.6rem clamp(1.2rem,4vw,3.2rem); color:var(--ink-faint); font-size:0.76rem; border-top:1px solid var(--border); font-weight:600; }
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
    return `<a class="card" href="countries/${slugify(c.fields["countries (eng)"])}.html">
    <div class="name">${c.fields["countries (eng)"]}</div>
    <div class="overall">Four-pillar breakdown</div>
    <div class="ring-grid">
      ${PILLARS.map(p => `
        <div class="ring-item">
          <div class="ring-wrap">${ringGauge(fmtScore(c.fields[p.field]), p.color, 64, 6)}</div>
          <div class="ring-name">${p.short}</div>
        </div>`).join("")}
    </div>
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
  <div class="card" style="max-width:560px;">
    <div class="ring-grid">
      ${PILLARS.map(p => `
        <div class="ring-item">
          <div class="ring-wrap">${ringGauge(fmtScore(c.fields[p.field]), p.color, 92, 9)}</div>
          <div class="ring-name">${p.label}</div>
        </div>`).join("")}
    </div>
  </div>
</main>`;
    return pageShell(c.fields["countries (eng)"], body);
}

function indexPage(countries) {
    const scoredCounts = PILLARS.map(p => {
        const withData = countries.filter(c => fmtScore(c.fields[p.field]) !== null).length;
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
