// Run: node tag-search.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    buildTagIndex, caretToken, formatCount, formatTagForDisplay, formatTagForInsert, insertTagAt, searchTags,
} from "./tag-search.js";

const tags = (results) => results.map((r) => r.tag);

// --- CSV parsing ---
{
    const csv = [
        'long_hair,0,5351430,"longhair"',
        'blonde_hair,0,1700000,"yellow_hair,blond_hair"', // quoted aliases with a comma
        "short_hair,0,2100000",                              // no aliases column
        "blue_eyes,0,1900000,",                              // empty aliases column
        "",                                                  // empty line
        "   ",
        'ganyu_(genshin_impact),4,90000,"ganyu"',
    ].join("\n");
    const idx = buildTagIndex(csv);
    assert.equal(idx.size, 5);
    assert.deepEqual(idx.names, ["long_hair", "blonde_hair", "short_hair", "blue_eyes", "ganyu_(genshin_impact)"]);
    assert.deepEqual(idx.cats, [0, 0, 0, 0, 4]);
    assert.deepEqual(idx.counts, [5351430, 1700000, 2100000, 1900000, 90000]);
    assert.deepEqual(idx.aliases.map((a) => a.a), ["blond_hair", "ganyu", "longhair", "yellow_hair"]);

    // CRLF line endings parse identically, trailing newline included.
    const crlf = buildTagIndex(csv.replace(/\n/g, "\r\n") + "\r\n");
    assert.deepEqual(crlf.names, idx.names);
    assert.deepEqual(crlf.counts, idx.counts);
    assert.deepEqual(crlf.aliases, idx.aliases);

    // Garbage and empty input don't throw.
    assert.equal(buildTagIndex("").size, 0);
    assert.equal(buildTagIndex(undefined).size, 0);
    assert.equal(buildTagIndex(",0,5\nx").size, 1, "a line without a tag is skipped");
    assert.equal(buildTagIndex("x").counts[0], 0, "missing count is 0");
}

// --- search ranking ---
{
    const idx = buildTagIndex([
        "hair_ornament,0,500",
        "hairband,0,900",
        "long_hair,0,5000",
        "very_long_hair,0,800",
        'blonde_hair,0,1700,"hairy_blonde"',
        'ponytail,0,300,"hair_tied_back"',
        "hair,0,10",
    ].join("\n"));
    // Prefix beats alias beats substring, each by count.
    assert.deepEqual(tags(searchTags(idx, "hair")), [
        "hairband", "hair_ornament", "hair",    // prefix, by count
        "blonde_hair", "ponytail",               // alias prefix ("hairy_blonde", "hair_tied_back")
        "long_hair", "very_long_hair",           // substring, by count
    ]);
    // Ordering by count within prefix matches.
    assert.deepEqual(tags(searchTags(idx, "hair_")), ["hair_ornament", "ponytail"]);
    // Spaces in the query match underscores; case-insensitive.
    assert.deepEqual(tags(searchTags(idx, "Long H")), ["long_hair", "very_long_hair"]);
    // Substring only from 3 characters.
    assert.deepEqual(tags(searchTags(idx, "ng")), []);
    assert.deepEqual(tags(searchTags(idx, "ong")), ["long_hair", "very_long_hair"]);
    // Limit.
    assert.equal(searchTags(idx, "hair", 2).length, 2);
    assert.deepEqual(searchTags(idx, ""), []);
    assert.deepEqual(searchTags(buildTagIndex(""), "hair"), []);
    assert.deepEqual(searchTags(null, "hair"), []);
    // A tag found as prefix isn't repeated via its alias.
    const dup = buildTagIndex('long_hair,0,5,"long_locks"');
    assert.deepEqual(tags(searchTags(dup, "long")), ["long_hair"]);
}

// --- insert formatting ---
{
    assert.equal(formatTagForInsert("long_hair"), "long_hair", "underscores is the default");
    assert.equal(formatTagForInsert("long_hair", "underscores"), "long_hair");
    assert.equal(formatTagForInsert("long_hair", "spaces"), "long hair");
    // Parens escaped in both modes.
    assert.equal(formatTagForInsert("ganyu_(genshin_impact)", "underscores"), "ganyu_\\(genshin_impact\\)");
    assert.equal(formatTagForInsert("ganyu_(genshin_impact)", "spaces"), "ganyu \\(genshin impact\\)");
    assert.equal(formatTagForDisplay("long_hair"), "long hair");
    assert.equal(formatCount(5351430), "5.4M");
    assert.equal(formatCount(9000), "9K");
    assert.equal(formatCount(12), "12");
}

// --- caret math ---
{
    assert.deepEqual(caretToken("1girl, long_ha", 14), { word: "long_ha", start: 7, end: 14 });
    assert.deepEqual(caretToken("lo", 2), { word: "lo", start: 0, end: 2 });
    assert.deepEqual(caretToken("a, b", 2), { word: "", start: 2, end: 2 });
    assert.deepEqual(caretToken("line one\nsec", 12), { word: "sec", start: 9, end: 12 });
    // Caret in the middle: the word ends at the caret.
    assert.deepEqual(caretToken("1girl, smi, solo", 10), { word: "smi", start: 7, end: 10 });

    let r = insertTagAt("1girl, long_ha", 7, 14, "long_hair");
    assert.deepEqual(r, { value: "1girl, long_hair, ", caret: 18 });
    // A comma already follows: no ",,", caret lands after it.
    r = insertTagAt("1girl, smi, solo", 7, 10, "smile");
    assert.equal(r.value, "1girl, smile, solo");
    assert.equal(r.value.slice(0, r.caret), "1girl, smile, ");
    r = insertTagAt("lo", 0, 2, "long_hair");
    assert.deepEqual(r, { value: "long_hair, ", caret: 11 });
}

// --- the shipped example file is valid ---
{
    const idx = buildTagIndex(readFileSync(new URL("./tags.example.csv", import.meta.url), "utf8"));
    assert.ok(idx.size >= 25, `tags.example.csv has ${idx.size} tags`);
    assert.ok(idx.names.every((n) => /^[a-z0-9_()\-:.']+$/.test(n)), "example tags are booru-style");
    assert.deepEqual(tags(searchTags(idx, "long")), ["long_hair"]);
}

// --- sanity: a 20k-line list indexes fast (not a hard gate) ---
{
    const lines = [];
    for (let i = 0; i < 20000; i++) lines.push(`tag_${i.toString(36)}_${(i * 7919) % 10007},${i % 6},${(i * 31) % 100000},"alias_${i},alt_${i}"`);
    const t0 = performance.now();
    const idx = buildTagIndex(lines.join("\n"));
    const ms = performance.now() - t0;
    assert.equal(idx.size, 20000);
    if (ms > 500) console.warn(`tag-search: 20k lines indexed in ${ms.toFixed(0)} ms (> 500 ms)`);
    else console.log(`tag-search: 20k lines indexed in ${ms.toFixed(0)} ms`);
    const t1 = performance.now();
    for (let i = 0; i < 100; i++) searchTags(idx, "tag_" + i.toString(36));
    console.log(`tag-search: 100 searches in ${(performance.now() - t1).toFixed(0)} ms`);
}

console.log("tag-search: ok");
