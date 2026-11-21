import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-face",
});

export const metadata: Metadata = {
  title: "Timeline",
  description: "Your calendar and to-dos on one timeline.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} font-sans text-[13px] antialiased`}>{children}</body>
    </html>
  );
}
