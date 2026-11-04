// Point a fresh dev SillyTavern at the mocks. Run with ST stopped, after it has booted once
// (so data/default-user/settings.json exists):
//   node seed-st.mjs [path/to/SillyTavern] [comfyUrl] [llmUrl]
// Dev harness only - never run this against a real install.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] || new URL("./SillyTavern", import.meta.url).pathname;
const comfyUrl = process.argv[3] || "http://127.0.0.1:8188";
const llmUrl = process.argv[4] || "http://127.0.0.1:5001/v1";
const user = join(root, "data", "default-user");
const settingsPath = join(user, "settings.json");
if (!existsSync(settingsPath)) throw new Error(`${settingsPath} missing - boot ST once first`);

// ComfyUI API-format workflow using the extension's placeholders.
const workflow = {
    "3": { class_type: "KSampler", inputs: { seed: "*seed*", steps: "*steps*", cfg: "*cfg*", sampler_name: "*sampler*", scheduler: "*scheduler*", denoise: "*denoise*", model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["5", 0] } },
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "*model*" } },
    "5": { class_type: "EmptyLatentImage", inputs: { width: "*width*", height: "*height*", batch_size: 1 } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: "*input*", clip: ["4", 1] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: "*ninput*", clip: ["4", 1] } },
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: "kazuma", images: ["8", 0] } },
};
mkdirSync(join(user, "user", "workflows"), { recursive: true });
writeFileSync(join(user, "user", "workflows", "kazuma-mock.json"), JSON.stringify(workflow));

const s = JSON.parse(readFileSync(settingsPath, "utf8"));
s.firstRun = false;
s.main_api = "openai";
s.oai_settings = { ...s.oai_settings, chat_completion_source: "custom", custom_url: llmUrl, custom_model: "mock-model", stream_openai: false };
s.power_user = { ...s.power_user, image_overswipe: "generate", auto_connect: true };
s.extension_settings = s.extension_settings || {};
s.extension_settings["Image-gen-kazuma"] = {
    ...(s.extension_settings["Image-gen-kazuma"] || {}),
    enabled: true, comfyUrl, currentWorkflowName: "kazuma-mock.json", selectedModel: "mock_model.safetensors",
};
writeFileSync(settingsPath, JSON.stringify(s, null, 4));
console.log(`seeded ${settingsPath}`);
