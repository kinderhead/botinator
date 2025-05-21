import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true, // Generate declaration file (.d.ts)
    splitting: true,
    sourcemap: true,
    clean: true,
});