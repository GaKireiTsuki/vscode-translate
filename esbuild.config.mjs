import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");
const prod = !watch;

const opts = {
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  external: ["vscode"],
  sourcemap: prod ? "linked" : "inline",
  minify: prod,
  treeShaking: true,
  logLevel: "info",
};

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
  console.log("[esbuild] watching…");
} else {
  await build(opts);
}
