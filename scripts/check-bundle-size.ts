import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

interface Budget {
  label: string;
  dir: string;
  exts: string[];
  maxBytes: number;
}

const BUDGETS: Budget[] = [
  {
    label: "dashboard",
    dir: "apps/dashboard/dist/assets",
    exts: [".js"],
    maxBytes: 350 * 1024,
  },
  {
    label: "website",
    dir: "apps/website/out/_next/static/chunks",
    exts: [".js"],
    maxBytes: 200 * 1024,
  },
];

function dirSize(dir: string, exts: string[]): number {
  let total = 0;
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) total += dirSize(full, exts);
      else if (exts.some((e) => entry.endsWith(e))) total += s.size;
    }
  } catch {
    /* dir missing means build hasn't run */
  }
  return total;
}

function fmt(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

let failed = 0;
for (const b of BUDGETS) {
  const bytes = dirSize(b.dir, b.exts);
  if (bytes === 0) {
    console.log(`⚠ ${b.label}: build not found at ${b.dir}, skipping`);
    continue;
  }
  const pct = ((bytes / b.maxBytes) * 100).toFixed(0);
  if (bytes > b.maxBytes) {
    console.error(`✗ ${b.label}: ${fmt(bytes)} > budget ${fmt(b.maxBytes)} (${pct}%)`);
    failed++;
  } else {
    console.log(`✓ ${b.label}: ${fmt(bytes)} of ${fmt(b.maxBytes)} (${pct}%)`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} bundle(s) over budget`);
  process.exit(1);
}
