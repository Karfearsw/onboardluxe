import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import fs from "fs";
import path from "path";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));
  const resolveTsForJsImportsPlugin = {
    name: "resolve-ts-for-js-imports",
    setup(build: any) {
      build.onResolve({ filter: /^\.\.?\// }, (args: any) => {
        if (!args.path.endsWith(".js")) {
          return null;
        }

        const candidate = path.join(args.resolveDir, args.path);
        if (fs.existsSync(candidate)) {
          return null;
        }

        const tsCandidate = path.join(args.resolveDir, `${args.path.slice(0, -3)}.ts`);
        if (fs.existsSync(tsCandidate)) {
          return { path: tsCandidate };
        }

        return null;
      });
    },
  };

  console.log("building server (local)...");
  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    plugins: [resolveTsForJsImportsPlugin],
    logLevel: "info",
  });

  console.log("building api bundle (Vercel)...");
  await esbuild({
    entryPoints: ["api/[...path].ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/api/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    plugins: [resolveTsForJsImportsPlugin],
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
