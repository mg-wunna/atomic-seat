import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AtomicSeat | High-Concurrency Ticket Reservation Case Study",
  description:
    "AtomicSeat is a premium full-stack portfolio project showing transactional ticket reservations, expiring holds, and concurrency-safe inventory.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
