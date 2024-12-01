'use client';

import React, { createContext, useContext, useState } from 'react';

interface WalletContextType {
  privateKey: string | null;
  setPrivateKey: (key: string | null) => void;
}

const WalletContext = createContext<WalletContextType>({
  privateKey: null,
  setPrivateKey: () => {},
});

export const useWalletContext = () => useContext(WalletContext);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [privateKey, setPrivateKey] = useState<string | null>(null);

  return (
    <WalletContext.Provider value={{ privateKey, setPrivateKey }}>
      {children}
    </WalletContext.Provider>
  );
};
