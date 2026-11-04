// Minimal ComfyUI stand-in for the dev harness. Routes are the ones SillyTavern's
// /api/sd/comfy/* proxy (src/endpoints/stable-diffusion.js) and the extension itself call:
//   GET  /system_stats        ping
//   GET  /object_info         samplers, schedulers, models, vaes
//   POST /prompt              -> { prompt_id }
//   GET  /history/:id         -> finished job with one image output
//   GET  /view                -> a fixed 64x64 PNG
//   POST /interrupt           no-op
//   GET  /models/loras        LoRA list (browser fallback and server-plugin/)
// Run: node mock-comfy.mjs [port]   (default 8188)
import http from "node:http";
import zlib from "node:zlib";

const port = Number(process.argv[2] || process.env.MOCK_COMFY_PORT || 8188);

function crc32(buf) {
    let c, crc = 0xffffffff;
    for (let n = 0; n < buf.length; n++) {
        c = (crc ^ buf[n]) & 0xff;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}
/** 64x64 RGB gradient, so it's visibly an image in screenshots. */
function makePng(size = 64) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
    const raw = Buffer.alloc(size * (size * 3 + 1));
    for (let y = 0; y < size; y++) {
        const row = y * (size * 3 + 1);
        for (let x = 0; x < size; x++) {
            raw[row + 1 + x * 3] = x * 4; raw[row + 2 + x * 3] = y * 4; raw[row + 3 + x * 3] = 160;
        }
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
    ]);
}
const PNG = makePng();

const OBJECT_INFO = {
    KSampler: { input: { required: {
        sampler_name: [["euler", "euler_ancestral", "dpmpp_2m"]],
        scheduler: [["normal", "karras", "simple"]],
    } } },
    CheckpointLoaderSimple: { input: { required: { ckpt_name: [["mock_model.safetensors"]] } } },
    UNETLoader: { input: { required: { unet_name: [[]] } } },
    VAELoader: { input: { required: { vae_name: [["mock_vae.safetensors"]] } } },
    LoraLoader: { input: { required: { lora_name: [["mock_lora.safetensors"]] } } },
};

const prompts = []; // submitted workflows, newest last
let nextId = 1;

function send(res, status, body, type = "application/json") {
    res.writeHead(status, { "Content-Type": type, "Access-Control-Allow-Origin": "*" });
    res.end(type === "application/json" ? JSON.stringify(body) : body);
}

http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
        if (req.method === "OPTIONS") return send(res, 204, "", "text/plain");
        if (url.pathname === "/system_stats") return send(res, 200, { system: { os: "mock" }, devices: [] });
        if (url.pathname === "/object_info") return send(res, 200, OBJECT_INFO);
        if (url.pathname.startsWith("/object_info/")) {
            const k = url.pathname.split("/")[2];
            return send(res, 200, OBJECT_INFO[k] ? { [k]: OBJECT_INFO[k] } : {});
        }
        if (url.pathname === "/models/loras") return send(res, 200, ["mock_lora.safetensors"]);
        if (url.pathname === "/interrupt") return send(res, 200, {});
        if (url.pathname === "/prompt" && req.method === "POST") {
            const id = `mock-${nextId++}`;
            try { prompts.push({ id, workflow: JSON.parse(body).prompt }); } catch { prompts.push({ id, workflow: null }); }
            return send(res, 200, { prompt_id: id, number: nextId, node_errors: {} });
        }
        if (url.pathname.startsWith("/history/")) {
            const id = url.pathname.split("/")[2];
            if (!prompts.some(p => p.id === id)) return send(res, 200, {});
            return send(res, 200, { [id]: {
                status: { status_str: "success", completed: true, messages: [] },
                outputs: { "9": { images: [{ filename: `${id}.png`, subfolder: "", type: "output" }] } },
            } });
        }
        if (url.pathname === "/view") return send(res, 200, PNG, "image/png");
        // Debug only - e2e tests must not rely on this, they also run against real ComfyUI.
        if (url.pathname === "/__mock/prompts") return send(res, 200, prompts);
        send(res, 404, { error: `mock-comfy: no route ${req.method} ${url.pathname}` });
    });
}).listen(port, "0.0.0.0", () => console.log(`mock-comfy on http://127.0.0.1:${port}`));
