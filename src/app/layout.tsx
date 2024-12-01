import { ReactNode } from 'react';
import { Metadata } from 'next';
import '../styles/globals.css';
import { Inter } from 'next/font/google';
import Providers from './providers';
import { Analytics } from "@vercel/analytics/react"

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MemeSniper.Fun',
  description: 'Solana Social Based Token Sniper',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: ['/favicon.svg'],
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          {children}
          <Analytics />
        </Providers>
      </body>
    </html>
  );
}
