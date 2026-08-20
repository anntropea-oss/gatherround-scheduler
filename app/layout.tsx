import type { Metadata } from "next";
import { Archivo_Black, Geist_Mono, Space_Grotesk } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  subsets: ["latin"],
  weight: "400",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function requestOrigin(requestHeaders: Headers) {
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  return host ? `${protocol}://${host}` : "https://when-now.local";
}

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const origin = requestOrigin(requestHeaders);

  return {
    title: "When/Now",
    description:
      "A sharp scheduling poll for finding the time people can actually make.",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "When/Now",
      description: "Find the time people can actually make.",
      images: [`${origin}/og.png`],
    },
    twitter: {
      card: "summary_large_image",
      title: "When/Now",
      description: "Find the time people can actually make.",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${spaceGrotesk.variable} ${archivoBlack.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
