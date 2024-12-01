'use client';

import dynamic from 'next/dynamic';
import { TradingProvider } from '../contexts/TradingContext';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import TradingSettings from '@/components/TradingSettings';
import TwitterFeed from '@/components/TwitterFeed';
import { useState, useEffect } from 'react';
import { Keypair, Connection } from '@solana/web3.js';
import { useWalletContext } from '../contexts/WalletContext';
import { useTradingContext } from '../contexts/TradingContext';
import { PumpFunClient } from '../pumpFunClient';
import bs58 from 'bs58';

export default function Home() {
  const [isMobile, setIsMobile] = useState(false);
  const [pumpFunClient, setPumpFunClient] = useState<PumpFunClient | null>(null);
  const { privateKey } = useWalletContext();
  const tradingSettings = useTradingContext();

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024); // 1024px is the lg breakpoint
    };

    // Set initial value
    handleResize();

    // Add event listener
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!privateKey) return;

    try {
      const keyPair = Keypair.fromSecretKey(bs58.decode(privateKey));
      const connection = new Connection(process.env.NEXT_PUBLIC_HELIUS_RPC_URL, 'confirmed');
      const client = new PumpFunClient(connection, keyPair, process.env.NEXT_PUBLIC_HELIUS_RPC_URL, tradingSettings);
      setPumpFunClient(client);
    } catch (error) {
      console.error('Error initializing PumpFunClient:', error);
    }
  }, [privateKey, tradingSettings]);

  return (
    <TradingProvider>
      <div className="min-h-screen bg-gray-900 text-gray-100">
        <Header />
        
        <main className="container mx-auto px-4 py-6">
          {/* Mobile View */}
          <div className="lg:hidden flex flex-col space-y-4">
            <div className="h-[60vh] bg-gray-900 rounded-lg border border-gray-800 shadow-xl">
              <TwitterFeed />
            </div>
            <div className="bg-gray-900 rounded-lg border border-gray-800 shadow-xl">
              <TradingSettings isMobile={true} />
            </div>
          </div>

          {/* Desktop View - Preserved exactly as is */}
          <div className="hidden lg:grid grid-cols-12 gap-6">
            {/* Twitter Feed - Larger emphasis */}
            <div className="col-span-5 lg:col-span-6">
              <div className="bg-gray-900 rounded-lg border border-gray-800 h-[calc(100vh-12rem)] shadow-xl">
                <TwitterFeed />
              </div>
            </div>

            {/* Trading Settings - Compact version */}
            <div className="col-span-7 lg:col-span-6">
              <div className="bg-gray-900 rounded-lg border border-gray-800 h-[calc(100vh-12rem)] shadow-xl">
                <TradingSettings isMobile={false} />
              </div>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </TradingProvider>
  );
}
