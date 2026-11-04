/**
 * Tag autocomplete: CSV parsing, the search index, and the text math for inserting a tag at the
 * caret. No DOM here - index.js attaches it to fields. Lives in its own module so
 * tag-search.test.mjs can import it.
 *
 * Ported from alpkabac's fork (github.com/alpkabac/Image-gen-kazuma): sorted array + binary search
 * for prefix lookups, a separate sorted alias index, and a substring scan only as a fallback.
 *
 * CSV, no header, one tag per line:  tag,category,post_count,"alias1,alias2"
 * Category: 0 general, 1 artist, 3 copyright, 4 character, 5 meta. Aliases column optional.
 * For a personal list, post_count is just a ranking weight.
 */

/** Category colors, danbooru style. */
export const TAG_CAT_COLORS = {
    0: "#6cbded", // general
    1: "#e87a90", // artist
    3: "#c797ff", // copyright / series
    4: "#35c64a", // character
    5: "#f5ab3d", // meta
};

/** Split one CSV line into fields, honouring "quoted, fields" and "" escapes. */
function splitCsvLine(line) {
    const out = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quoted) {
            if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
            else if (ch === '"') quoted = false;
            else field += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ",") { out.push(field); field = ""; }
        else field += ch;
    }
    out.push(field);
    return out;
}

/** Binary search: first index whose key is >= prefix. */
export function lowerBound(arr, prefix, key) {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (key(arr[mid]) < prefix) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

/**
 * Parse the CSV text into a search index. Blank lines, CRLF and a missing aliases column are fine;
 * lines without a tag are skipped.
 */
export function buildTagIndex(text) {
    const names = [];
    const keys = [];
    const cats = [];
    const counts = [];
    const aliases = []; // { a, idx }
    for (const raw of String(text || "").split("\n")) {
        const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
        if (!line.trim()) continue;
        const [tag = "", cat = "", count = "", aliasField = ""] = splitCsvLine(line);
        const name = tag.trim();
        if (!name) continue;
        const idx = names.length;
        names.push(name);
        keys.push(name.toLowerCase());
        cats.push(parseInt(cat, 10) || 0);
        counts.push(parseInt(count, 10) || 0);
        for (const a of aliasField.split(",")) {
            const alias = a.trim().toLowerCase();
            // danbooru exports carry "/x"-style shorthand aliases; they only add noise.
            if (alias && alias[0] !== "/") aliases.push({ a: alias, idx });
        }
    }
    const sorted = names.map((_, i) => i).sort((x, y) => (keys[x] < keys[y] ? -1 : keys[x] > keys[y] ? 1 : 0));
    aliases.sort((x, y) => (x.a < y.a ? -1 : x.a > y.a ? 1 : 0));
    return { names, keys, cats, counts, sorted, aliases, size: names.length };
}

/**
 * Up to `limit` tags for what the user typed: tag-name prefix matches first, then alias prefix
 * matches, then (for 3+ characters) substring matches - each group ordered by count.
 * Spaces in the query match underscores in tags.
 */
export function searchTags(index, query, limit = 15) {
    if (!index?.size || !query) return [];
    const q = String(query).toLowerCase().trim().replace(/ /g, "_");
    if (!q) return [];
    const seen = new Set();
    const prefix = [], alias = [], substring = [];

    for (let i = lowerBound(index.sorted, q, (t) => index.keys[t]); i < index.sorted.length; i++) {
        const t = index.sorted[i];
        if (!index.keys[t].startsWith(q)) break;
        seen.add(t);
        prefix.push(t);
        if (prefix.length >= limit * 2) break;
    }
    if (prefix.length < limit) {
        for (let i = lowerBound(index.aliases, q, (e) => e.a); i < index.aliases.length; i++) {
            const { a, idx } = index.aliases[i];
            if (!a.startsWith(q)) break;
            if (seen.has(idx)) continue;
            seen.add(idx);
            alias.push(idx);
            if (prefix.length + alias.length >= limit * 2) break;
        }
    }
    if (prefix.length + alias.length < limit && q.length >= 3) {
        for (let t = 0; t < index.size && substring.length < limit; t++) {
            if (!seen.has(t) && index.keys[t].includes(q)) { seen.add(t); substring.push(t); }
        }
    }

    const byCount = (x, y) => index.counts[y] - index.counts[x];
    const merged = [];
    for (const group of [prefix, alias, substring]) {
        group.sort(byCount);
        for (const t of group) { if (merged.length >= limit) break; merged.push(t); }
    }
    return merged.map((t) => ({ tag: index.names[t], cat: index.cats[t], count: index.counts[t] }));
}

/**
 * The tag as it should be typed into the prompt. "underscores" keeps the booru spelling
 * (Illustrious-style prompts); "spaces" swaps them for spaces. Parentheses are always escaped,
 * since ComfyUI reads bare ( ) as emphasis.
 */
export function formatTagForInsert(tag, style = "underscores") {
    const t = style === "spaces" ? String(tag).replace(/_/g, " ") : String(tag);
    return t.replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** How a tag is shown in the dropdown. */
export function formatTagForDisplay(tag) {
    return String(tag).replace(/_/g, " ");
}

export function formatCount(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return String(n);
}

/** The partial tag the caret sits at the end of: from the previous comma (or line start) to the caret. */
export function caretToken(text, caret) {
    const value = String(text || "");
    const pos = Math.max(0, Math.min(caret ?? value.length, value.length));
    let start = Math.max(value.lastIndexOf(",", pos - 1), value.lastIndexOf("\n", pos - 1)) + 1;
    while (start < pos && /\s/.test(value[start])) start++;
    return { word: value.slice(start, pos), start, end: pos };
}

/**
 * Replace text[start, end) with the tag and a ", " separator - unless a comma already follows,
 * so editing the middle of a list doesn't leave ",,". Returns the new text and caret position.
 */
export function insertTagAt(text, start, end, formatted) {
    const value = String(text || "");
    const after = value.slice(end);
    const sep = /^\s*,/.test(after) ? "" : ", ";
    const next = value.slice(0, start) + formatted + sep + after;
    const caret = start + formatted.length + (sep ? sep.length : (after.match(/^\s*,\s?/)?.[0].length || 0));
    return { value: next, caret };
}
