import React from 'react';
import Image from 'next/image';

export default function Header() {
  return (
    <header className="bg-gray-900 border-b border-gray-800">
      <div className="container mx-auto px-4">
        {/* Network Status Bar */}
        <div className="py-2 border-b border-gray-800">
          <div className="flex items-center justify-end space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-xs text-gray-400">Solana</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-xs text-gray-400">Twitter API</span>
            </div>
          </div>
        </div>

        {/* Main Header */}
        <div className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-xl font-bold text-white">memesniper.fun</span>
                <span className="px-2 py-1 text-xs font-medium bg-yellow-500/10 text-yellow-500 rounded-full">
                  Beta
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
