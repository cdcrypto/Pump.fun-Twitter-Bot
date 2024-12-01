import React from 'react';

export default function Footer() {
  return (
    <footer className="bg-gray-900 border-t border-gray-800">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-400">
            {new Date().getFullYear()} memesniper.fun. All rights reserved.
          </div>
          <div className="flex items-center space-x-4">
            <a
              href="https://x.com/memesnipersol"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-gray-300 transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a
              href="https://t.me/+PAiSfBjNGJo5YWQx"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-blue-500 transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.223-.548.223l.188-2.85 5.18-4.68c.223-.198-.054-.308-.346-.11l-6.4 4.02-2.76-.918c-.6-.183-.612-.6.125-.89l10.782-4.156c.5-.183.943.112.78.89z"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
