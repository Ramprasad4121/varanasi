import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Varanasi: gold savings and chits",
  description: "Bank-backed gold savings and chit funds in Telugu and English (local demo)",
};

export const viewport = { width: "device-width", initialScale: 1, themeColor: "#7a4b00" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
