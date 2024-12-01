'use client';

import React from 'react';
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

// Maintains a persistent list of Twitter usernames to filter out from the feed, helping users avoid known scammers or unreliable token calls.

interface BlacklistContextType {
  blacklistedUsers: string[];
  addToBlacklist: (username: string) => void;
  removeFromBlacklist: (username: string) => void;
  isBlacklisted: (username: string) => boolean;
}

const BlacklistContext = createContext<BlacklistContextType>({
  blacklistedUsers: [],
  addToBlacklist: () => {},
  removeFromBlacklist: () => {},
  isBlacklisted: () => false,
});

export function useBlacklistContext() {
  const context = useContext(BlacklistContext);
  if (!context) {
    throw new Error('useBlacklistContext must be used within a BlacklistProvider');
  }
  return context;
}

interface BlacklistProviderProps {
  children: ReactNode;
}

export function BlacklistProvider({ children }: BlacklistProviderProps) {
  const [blacklistedUsers, setBlacklistedUsers] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedBlacklist = localStorage.getItem('pumpfun_blacklistedUsers');
        if (savedBlacklist) {
          const parsed = JSON.parse(savedBlacklist);
          if (Array.isArray(parsed)) {
            return [...new Set(parsed)]
              .filter(user => typeof user === 'string' && user.trim().length > 0)
              .map(user => user.trim().toLowerCase());
          }
        }
      } catch (error) {
        console.error('Error loading blacklist from localStorage:', error);
        try {
          localStorage.removeItem('pumpfun_blacklistedUsers');
        } catch (e) {
          console.error('Failed to clear corrupted blacklist:', e);
        }
      }
    }
    return [];
  });

  // Cache blacklistedUsers changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('pumpfun_blacklistedUsers', JSON.stringify(blacklistedUsers));
    } catch (error) {
      console.error('Error saving blacklist to localStorage:', error);
    }
  }, [blacklistedUsers]);

  const addToBlacklist = useCallback((username: string) => {
    if (!username || typeof username !== 'string') return;
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername) return;
    setBlacklistedUsers(prev => [...new Set([...prev, cleanUsername])]);
  }, []);

  const removeFromBlacklist = useCallback((username: string) => {
    if (!username) return;
    const cleanUsername = username.trim().toLowerCase();
    setBlacklistedUsers(prev => prev.filter(u => u !== cleanUsername));
  }, []);

  const isBlacklisted = useCallback((username: string) => {
    if (!username) return false;
    const cleanUsername = username.trim().toLowerCase();
    return blacklistedUsers.includes(cleanUsername);
  }, [blacklistedUsers]);

  const value = {
    blacklistedUsers,
    addToBlacklist,
    removeFromBlacklist,
    isBlacklisted,
  };

  return (
    <BlacklistContext.Provider value={value}>
      {children}
    </BlacklistContext.Provider>
  );
}
