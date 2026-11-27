import { defineConfig } from "tsup";

export default defineConfig({
  target: "es2020",
  entry: ["src/index.ts", "src/validators.ts", "src/host.ts"],
  format: ["esm"],
  dts: true,
  splitting: true,
  clean: true,
  outDir: "dist",
});
