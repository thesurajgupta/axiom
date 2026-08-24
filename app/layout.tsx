import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

/**
 * Archivo for display: it comes out of signage and industrial lettering, which
 * suits a document whose job is to tell you what is wrong before you ship.
 * The Plex superfamily handles body and evidence — it was drawn for technical
 * documentation, and using both members keeps prose and code visually related.
 */
const archivo = Archivo({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const TITLE = "Axiom — find what's broken before you ship";
const DESCRIPTION =
  "Axiom opens your site in a real browser, uses it with only a keyboard, and reports every blocker, security gap and broken API — then writes the prompt that fixes them.";

/**
 * Open Graph tags were added because Axiom flagged them missing on Axiom.
 * Without them the link renders as a grey box everywhere it is shared.
 */
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "Axiom",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
