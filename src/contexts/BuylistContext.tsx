'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface BuylistContextType {
  buylistedTokens: string[];
  addToBuylist: (token: string) => void;
  removeFromBuylist: (token: string) => void;
  isBuylisted: (token: string) => boolean;
}

const BuylistContext = createContext<BuylistContextType>({
  buylistedTokens: [],
  addToBuylist: () => {},
  removeFromBuylist: () => {},
  isBuylisted: () => false,
});

export const useBuylistContext = () => useContext(BuylistContext);

export const BuylistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [buylistedTokens, setBuylistedTokens] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('buylistedTokens');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('buylistedTokens', JSON.stringify(buylistedTokens));
    }
  }, [buylistedTokens]);

  const addToBuylist = (token: string) => {
    setBuylistedTokens((prev) => [...new Set([...prev, token])]);
  };

  const removeFromBuylist = (token: string) => {
    setBuylistedTokens((prev) => prev.filter((t) => t !== token));
  };

  const isBuylisted = useCallback((token: string) => {
    return buylistedTokens.includes(token);
  }, [buylistedTokens]);

  return (
    <BuylistContext.Provider
      value={{ buylistedTokens, addToBuylist, removeFromBuylist, isBuylisted }}
    >
      {children}
    </BuylistContext.Provider>
  );
};
