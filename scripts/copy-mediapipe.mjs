// MediaPipe ki wasm files ko public/ mein copy karta hai, taaki wo apne hi domain se load hon
// (CDN version mismatch ka jhanjhat nahi). `npm install` ke baad apne aap chalta hai.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const src = join("node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join("public", "mediapipe", "wasm");

if (!existsSync(src)) {
  console.warn("[copy-mediapipe] wasm folder nahi mila, skip kar raha hoon:", src);
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
for (const file of readdirSync(src)) {
  // module_internal variant ki zaroorat nahi hai.
  if (file.includes("module_internal")) continue;
  cpSync(join(src, file), join(dest, file));
}
console.log("[copy-mediapipe] wasm files copied to", dest);
