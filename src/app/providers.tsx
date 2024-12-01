'use client';

import { ReactNode, useEffect, useState } from 'react';
import { TradingProvider } from '../contexts/TradingContext';
import { BlacklistProvider } from '../contexts/BlacklistContext';
import { BuylistProvider } from '../contexts/BuylistContext';
import { WalletProvider } from '../contexts/WalletContext';
import { Toaster } from 'react-hot-toast';

export default function Providers({
  children,
}: {
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const hasVisited = localStorage.getItem('hasVisited');
    if (!hasVisited && typeof window !== 'undefined') {
      localStorage.setItem('hasVisited', 'true');
      window.location.reload();
      return;
    }

    setMounted(true);
    return () => {
      setMounted(false);
    };
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <WalletProvider>
      <TradingProvider>
        <BlacklistProvider>
          <BuylistProvider>
            {children}
            <Toaster position="bottom-right" />
          </BuylistProvider>
        </BlacklistProvider>
      </TradingProvider>
    </WalletProvider>
  );
}
