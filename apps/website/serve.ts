import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { ports } from "@template/configs/ports";

const ROOT = resolve("out");

if (!existsSync(ROOT)) {
  process.stderr.write(
    `[serve] Error: Build directory '${ROOT}' not found. Run 'bun run build' first.\n`,
  );
  process.exit(1);
}

const securityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function safePath(pathname: string): string | null {
  if (pathname.includes("\0")) return null;
  const resolved = resolve(join(ROOT, pathname));
  if (!resolved.startsWith(`${ROOT}/`) && resolved !== ROOT) return null;
  return resolved;
}

function withHeaders(response: Response, isHtml: boolean): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders)) {
    headers.set(key, value);
  }
  headers.set("Cache-Control", isHtml ? "no-cache" : "public, max-age=31536000, immutable");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

Bun.serve({
  port: ports.website,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;

    const filePath = safePath(pathname);
    if (!filePath) return withHeaders(new Response("Forbidden", { status: 403 }), true);

    const file = Bun.file(filePath);
    if (await file.exists()) return withHeaders(new Response(file), pathname.endsWith(".html"));

    // Try .html extension for clean URLs
    const htmlPath = safePath(`${pathname}.html`);
    if (htmlPath) {
      const htmlFile = Bun.file(htmlPath);
      if (await htmlFile.exists()) return withHeaders(new Response(htmlFile), true);
    }

    // Fallback to 404 page
    const notFoundFile = Bun.file(join(ROOT, "404.html"));
    if (await notFoundFile.exists()) {
      return withHeaders(new Response(notFoundFile, { status: 404 }), true);
    }
    return withHeaders(new Response("Not Found", { status: 404 }), true);
  },
});
