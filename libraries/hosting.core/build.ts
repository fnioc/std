import { rm } from "node:fs/promises";
import { rollup } from "rollup";
import dts from "rollup-plugin-dts";

await rm("dist", { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  target: "node",
  format: "esm",
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Emit per-file .d.ts into a scratch dir, then roll them up into a single dist/index.d.ts.
await Bun.$`tsc -p tsconfig.json --emitDeclarationOnly --outDir dist/.types`;

const dtsBundle = await rollup({
  input: "dist/.types/index.d.ts",
  plugins: [dts()],
});
await dtsBundle.write({ file: "dist/index.d.ts", format: "es" });
await dtsBundle.close();

await rm("dist/.types", { recursive: true, force: true });
