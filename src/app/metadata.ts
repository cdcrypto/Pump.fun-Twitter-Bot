import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'memesniper.fun',
  description: 'Solana Token Trading Bot - Real-time token monitoring and auto-buy capabilities',
  icons: {
    icon: [{ url: '🔫', type: 'image/svg+xml' }],
  },
  openGraph: {
    title: 'MemeSniper.fun',
    description: 'Solana Token Trading Bot - Real-time token monitoring and auto-buy capabilities',
    url: 'https://memesniper.fun',
    siteName: 'memesniper.fun',
    images: [
      {
        url: 'https://memesniper.fun/social-share.svg',
        width: 1200,
        height: 630,
        alt: 'memesniper.fun - Solana Token Trading Bot',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'memesniper.fun',
    description: 'Solana Token Trading Bot - Real-time token monitoring and auto-buy capabilities',
    creator: '@SocialSnipeSol',
    images: ['https://memesniper.fun/social-share.svg'],
  },
};
