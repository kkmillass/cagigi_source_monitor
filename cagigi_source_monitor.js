const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE || "Source Monitor";

if (!TOKEN || !BASE_ID) {
    console.error("Missing AIRTABLE_TOKEN or AIRTABLE_BASE_ID environment variable.");
    process.exit(1);
}

const API_ROOT = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`;

function hashText(text) {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
    }
    return hash.toString();
}

function normalize(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

async function listAllRecords() {
    let records = [];
    let offset;
    do {
        const url = new URL(API_ROOT);
        if (offset) url.searchParams.set("offset", offset);
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${TOKEN}` }
        });
        if (!res.ok) {
            throw new Error(`Failed to list records: ${res.status} ${await res.text()}`);
        }
        const data = await res.json();
        records = records.concat(data.records);
        offset = data.offset;
    } while (offset);
    return records;
}

async function updateRecord(id, fields) {
    const res = await fetch(`${API_ROOT}/${id}`, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ fields })
    });
    if (!res.ok) {
        throw new Error(`Failed to update record ${id}: ${res.status} ${await res.text()}`);
    }
}

async function main() {
    const records = await listAllRecords();
    console.log(`Checking ${records.length} source(s)...`);

    for (const record of records) {
        const url = record.fields["URL"];
        const name = record.fields["Source Name"] || url;
        if (!url) continue;

        const now = new Date().toISOString();
        let newHash = null;
        let fetchError = null;

        try {
            const response = await fetch(url, {
                headers: { "User-Agent": "Mozilla/5.0 (CAGIGI source monitor)" }
            });
            const html = await response.text();
            newHash = hashText(normalize(html));
        } catch (err) {
            fetchError = err.message;
        }

        if (fetchError) {
            await updateRecord(record.id, {
                "Last Checked": now,
                "Change Detected": true,
                "Notes": `Could not fetch page: ${fetchError}. Check the URL manually.`
            });
            console.log(`[error] ${name}: ${fetchError}`);
            continue;
        }

        const oldHash = record.fields["Last Hash"];
        const changed = !!oldHash && oldHash !== newHash;

        await updateRecord(record.id, {
            "Last Hash": newHash,
            "Last Checked": now,
            "Change Detected": changed,
            "Notes": changed
                ? "Page content changed since last check. Review manually before updating any score."
                : record.fields["Notes"] || ""
        });

        console.log(`[ok] ${name}: ${changed ? "CHANGED - flagged" : "no change"}`);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
