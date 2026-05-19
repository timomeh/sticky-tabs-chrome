import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/background.ts"],
  format: "esm",
  outDir: "dist",
  target: "chrome120",
  copy: ["manifest.json", "icons"],
})
