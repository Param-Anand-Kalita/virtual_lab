import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'BuildBench',
  applicationName: 'BuildBench',
  description: 'Explore a 3D desktop PC, assemble one from an empty workbench by dragging parts onto their mounts, and check a CPU, motherboard, RAM kit and case against three documented fit rules.',
  icons: { icon: '/favicon.svg' },
  openGraph: { title: 'BuildBench', siteName: 'BuildBench', type: 'website' },
};

/** viewport-fit=cover lets the layout use env(safe-area-inset-*) on notched phones. User zoom is left enabled. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
