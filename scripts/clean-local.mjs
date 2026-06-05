import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const removeTargets = [
  ".next/cache",
  ".next/dev",
  ".turbo",
  "dist",
  "coverage",
  "tsconfig.tsbuildinfo",
  ".dockio-panel-dev.log",
  ".dockio-panel-preview.log"
];

let removed = 0;
for (const target of removeTargets) {
  const fullPath = path.resolve(root, target);
  if (!fullPath.startsWith(root + path.sep) && fullPath !== root) continue;
  if (!fs.existsSync(fullPath)) continue;
  fs.rmSync(fullPath, { recursive: true, force: true });
  console.log(`removed ${target}`);
  removed += 1;
}

if (process.argv.includes("--deps")) {
  const depsPath = path.resolve(root, "node_modules");
  if (depsPath.startsWith(root + path.sep) && fs.existsSync(depsPath)) {
    fs.rmSync(depsPath, { recursive: true, force: true });
    console.log("removed node_modules");
    removed += 1;
  }
}

if (removed === 0) console.log("nothing to clean");
