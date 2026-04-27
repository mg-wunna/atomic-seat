import { ports } from "./ports.js";

const isDev = process.env.NODE_ENV !== "production";

const devOrigins = [
  `http://localhost:${ports.server}`,
  `http://localhost:${ports.website}`,
  `http://localhost:${ports.dashboard}`,
];

function buildProdOrigins(): string[] {
  const domain = process.env.DOMAIN ?? "localhost";
  return [
    `https://www.${domain}`,
    `https://app.${domain}`,
    `https://admin.${domain}`,
    `https://apis.${domain}`,
  ];
}

function isPrivateNetworkOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    );
  } catch {
    return false;
  }
}

function isValidHttpsOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function getProdOrigins(): string[] {
  const envOrigins = process.env.CORS_ORIGINS;
  if (envOrigins) {
    return envOrigins
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean)
      .filter(isValidHttpsOrigin);
  }
  return buildProdOrigins();
}

export function corsOriginHandler(origin: string | undefined): string | undefined {
  if (!origin) return undefined;

  if (isDev) {
    if (devOrigins.includes(origin) || isPrivateNetworkOrigin(origin)) {
      return origin;
    }
    return undefined;
  }

  const prodOrigins = getProdOrigins();
  return prodOrigins.includes(origin) ? origin : undefined;
}

export const corsOrigins = isDev ? devOrigins : buildProdOrigins();
