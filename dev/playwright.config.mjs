// ST_URL (default http://localhost:8000), optional ST_USER / ST_PASS for basic auth.
// Same command for the dev harness and a real install: ST_URL=http://localhost:8000 npx playwright test
import { defineConfig } from "@playwright/test";

const user = process.env.ST_USER;
export default defineConfig({
    testDir: "./e2e",
    // Real renders take 10-60 s; prompt generation on a real LLM can take as long again.
    timeout: 240_000,
    expect: { timeout: 15_000 },
    // One SillyTavern, one chat at a time: tests mutate the open chat.
    workers: 1,
    fullyParallel: false,
    retries: 0,
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        baseURL: process.env.ST_URL || "http://localhost:8000",
        httpCredentials: user ? { username: user, password: process.env.ST_PASS || "" } : undefined,
        viewport: { width: 1400, height: 900 },
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
    },
});
