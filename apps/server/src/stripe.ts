import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, { maxNetworkRetries: 2 });
  }
  return stripeClient;
}

export function getClientUrl(): string {
  const raw =
    process.env.WEBSITE_URL ||
    process.env.PUBLIC_WEBSITE_URL ||
    process.env.NEXT_PUBLIC_WEBSITE_URL ||
    process.env.DASHBOARD_URL ||
    process.env.PUBLIC_DASHBOARD_URL ||
    process.env.NEXT_PUBLIC_DASHBOARD_URL ||
    "http://localhost:3001";
  return raw.replace(/\/+$/, "");
}

function normalizeOrigin(origin: string | undefined | null): string | null {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    return url.origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function isTrustedReturnOrigin(origin: string): boolean {
  const url = new URL(origin);
  if (process.env.NODE_ENV !== "production") {
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  }
  const configured = [
    process.env.WEBSITE_URL,
    process.env.PUBLIC_WEBSITE_URL,
    process.env.NEXT_PUBLIC_WEBSITE_URL,
    process.env.DASHBOARD_URL,
    process.env.PUBLIC_DASHBOARD_URL,
    process.env.NEXT_PUBLIC_DASHBOARD_URL,
    process.env.CORS_ORIGINS,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => normalizeOrigin(value.trim()))
    .filter(Boolean);
  return url.protocol === "https:" && configured.includes(origin);
}

export function getCheckoutReturnUrl(requestOrigin?: string | null): string {
  const origin = normalizeOrigin(requestOrigin);
  if (origin && isTrustedReturnOrigin(origin)) return origin;
  return getClientUrl();
}
