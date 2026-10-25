import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Family Finance Manager", template: "%s · Family Finance Manager" },
  description: "Plan and organise your family's finances in one place",
  applicationName: "Family Finance Manager",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
