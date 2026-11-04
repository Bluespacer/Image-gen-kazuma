// OpenAI-compatible stand-in for the prompt LLM. Always answers with the same image prompt,
// so the dev harness can run the full generation path without a model.
//   GET  /v1/models
//   POST /v1/chat/completions   (plain JSON, or SSE when "stream": true)
// Run: node mock-llm.mjs [port]   (default 5001)
// Point ST at it: Chat Completion -> Custom (OpenAI-compatible), URL http://127.0.0.1:5001/v1
import http from "node:http";

const port = Number(process.argv[2] || process.env.MOCK_LLM_PORT || 5001);
const REPLY = process.env.MOCK_LLM_REPLY || "1girl, solo, long_hair, smile, looking_at_viewer, upper_body, indoors, bedroom, masterpiece";
const requests = [];

function send(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(body));
}

http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
        if (url.pathname.endsWith("/models")) return send(res, 200, { object: "list", data: [{ id: "mock-model", object: "model" }] });
        if (url.pathname.endsWith("/chat/completions") && req.method === "POST") {
            let parsed = {};
            try { parsed = JSON.parse(body); } catch {}
            requests.push(parsed);
            if (parsed.stream) {
                res.writeHead(200, { "Content-Type": "text/event-stream" });
                res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: "assistant", content: REPLY } }] })}\n\n`);
                res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
                return res.end("data: [DONE]\n\n");
            }
            return send(res, 200, {
                id: "mock", object: "chat.completion", model: "mock-model", created: Math.floor(Date.now() / 1000),
                choices: [{ index: 0, message: { role: "assistant", content: REPLY }, finish_reason: "stop" }],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            });
        }
        // Debug only, like mock-comfy's.
        if (url.pathname === "/__mock/requests") return send(res, 200, requests);
        send(res, 404, { error: `mock-llm: no route ${req.method} ${url.pathname}` });
    });
}).listen(port, "0.0.0.0", () => console.log(`mock-llm on http://127.0.0.1:${port}`));
