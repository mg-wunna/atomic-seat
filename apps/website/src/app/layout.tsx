import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Template Website",
  description: "Replace this with your product landing page.",
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
