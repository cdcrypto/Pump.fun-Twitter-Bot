'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Tab } from '@headlessui/react';
import { useTradingContext } from '../contexts/TradingContext';
import { useBlacklistContext } from '../contexts/BlacklistContext';
import { useBuylistContext } from '../contexts/BuylistContext';
import { toast } from 'react-hot-toast';
import QRCode from 'qrcode';
import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { EyeIcon, EyeSlashIcon, CogIcon, UserGroupIcon, WalletIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline';
import { RPC_ENDPOINT } from '../constants';
import OrderStatus from './OrderStatus';
import PurchasedTokens from './PurchasedTokens';

interface TradingSettingsProps {
  isMobile: boolean;
}

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

const PRESET_AMOUNTS = [0.1, 0.25, 0.5, 1];
const PRESET_SLIPPAGES = [2.5, 5, 10, 25];

const TradingSettings: React.FC<TradingSettingsProps> = ({ isMobile }) => {
  const {
    privateKey,
    setPrivateKey,
    minFollowers,
    setMinFollowers,
    autoBuyEnabled,
    setAutoBuyEnabled,
    buyAmount,
    setBuyAmount,
    slippage,
    setSlippage,
    followerCheckEnabled,
    setFollowerCheckEnabled,
    creationTimeEnabled,
    setCreationTimeEnabled,
    maxCreationTime,
    setMaxCreationTime,
  } = useTradingContext();

  const { blacklistedUsers, addToBlacklist, removeFromBlacklist } = useBlacklistContext();
  const { buylistedTokens, addToBuylist, removeFromBuylist } = useBuylistContext();

  const [mounted, setMounted] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [newBlacklistedUser, setNewBlacklistedUser] = useState('');
  const [newBuylistUser, setNewBuylistUser] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState(0);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingAutoBuy, setPendingAutoBuy] = useState(false);

  // Initialize Solana connection
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');

  const updateBalance = useCallback(async (address: string) => {
    try {
      const pubKey = new PublicKey(address);
      const balance = await connection.getBalance(pubKey);
      setSolBalance(balance / LAMPORTS_PER_SOL);
    } catch (err) {
      console.error('Error fetching balance:', err);
      setSolBalance(null);
    }
  }, [connection]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const checkPrivateKey = async () => {
      if (privateKey) {
        try {
          const decodedKey = bs58.decode(privateKey);
          const keypair = Keypair.fromSecretKey(decodedKey);
          const pubKeyStr = keypair.publicKey.toString();
          setPublicKey(pubKeyStr);
          await updateBalance(pubKeyStr);
          
          const qrUrl = await QRCode.toDataURL(pubKeyStr);
          setQrCodeUrl(qrUrl);
        } catch (err) {
          console.error('Error deriving public key:', err);
          setPublicKey(null);
          setQrCodeUrl(null);
        }
      } else {
        setPublicKey(null);
        setSolBalance(null);
        setQrCodeUrl(null);
      }
    };

    checkPrivateKey();
  }, [privateKey, updateBalance]);

  if (!mounted) {
    return null;
  }

  const handlePrivateKeyChange = (value: string) => {
    try {
      bs58.decode(value);
      setPrivateKey(value);
      setError(null);
    } catch (err) {
      setError('Invalid private key format');
    }
  };

  const handleGenerateWallet = () => {
    try {
      const randomBytes = new Uint8Array(32);
      crypto.getRandomValues(randomBytes);
      const newKeypair = Keypair.fromSeed(randomBytes);
      const newPrivateKey = bs58.encode(newKeypair.secretKey);
      const newPublicKey = newKeypair.publicKey.toString();
      
      const content = `Private Key: ${newPrivateKey}\nPublic Key: ${newPublicKey}\n\nIMPORTANT: Keep this file secure and never share your private key with anyone!`;
      const blob = new Blob([content], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `solana-wallet-${newPublicKey.slice(0, 8)}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      setPrivateKey(newPrivateKey);
      setError(null);
      toast.success('New wallet generated and private key downloaded');
    } catch (err) {
      console.error('Failed to generate wallet:', err);
      setError('Failed to generate new wallet');
      toast.error('Failed to generate new wallet');
    }
  };

  const handleImportClick = () => {
    if (!isImporting) {
      setPrivateKey('');
      setPublicKey('');
      setSolBalance(null);
      setIsImporting(true);
    } else {
      if (privateKey) {
        try {
          handlePrivateKeyChange(privateKey);
          toast.success('Wallet imported successfully');
          setIsImporting(false);
        } catch (err) {
          toast.error('Invalid private key');
        }
      } else {
        setError('Please enter a private key');
      }
    }
  };

  const handleAutoBuyToggle = () => {
    if (!autoBuyEnabled) {
      // If turning on auto-buy, show confirmation
      setShowConfirmation(true);
      setPendingAutoBuy(true);
    } else {
      // If turning off auto-buy, do it immediately
      setAutoBuyEnabled(false);
    }
  };

  const confirmAutoBuy = () => {
    setAutoBuyEnabled(true);
    setShowConfirmation(false);
    setPendingAutoBuy(false);
  };

  const cancelAutoBuy = () => {
    setShowConfirmation(false);
    setPendingAutoBuy(false);
  };

  const tabs = [
    { name: 'Trading', icon: CogIcon },
    { name: 'Lists', icon: UserGroupIcon },
    { name: 'Holdings', icon: CurrencyDollarIcon  },
    { name: 'Wallet', icon: WalletIcon },
  ];

  return (
    <div className="bg-gray-900 rounded-xl shadow-lg overflow-hidden border border-gray-800">
      <Tab.Group defaultIndex={0} selectedIndex={selectedTab} onChange={setSelectedTab}>
        <Tab.List className="flex border-b border-gray-800">
          {tabs.map((tab) => (
            <Tab
              key={tab.name}
              className={({ selected }) =>
                classNames(
                  'flex items-center space-x-2 px-4 py-3 text-sm font-medium focus:outline-none flex-1 transition-all duration-200',
                  selected
                    ? 'text-yellow-500 border-b-2 border-yellow-500 bg-gray-800/50'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30'
                )
              }
            >
              <tab.icon className="h-5 w-5" />
              <span>{tab.name}</span>
            </Tab>
          ))}
        </Tab.List>

        <Tab.Panels className="max-h-[calc(100vh-12rem)] overflow-y-auto">
          {/* Trading Panel */}
          <Tab.Panel className="p-4">
            <div className="space-y-4">
              {/* Auto-buy Settings */}
              <div className="space-y-4">
                {/* Main Auto-buy Toggle */}
                <div 
                  className="flex items-center justify-between bg-gray-800/50 p-4 rounded-lg cursor-pointer hover:bg-gray-800/70 transition-colors"
                  onClick={handleAutoBuyToggle}
                >
                  <div>
                    <span className="text-sm font-medium text-white">Auto-buy</span>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {autoBuyEnabled 
                        ? "Actively buying tokens from new tweets" 
                        : "Configure settings below, then enable to start buying"}
                    </p>
                  </div>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={autoBuyEnabled || pendingAutoBuy}
                      onChange={(e) => e.stopPropagation()}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500"></div>
                  </div>
                </div>

                {/* Confirmation Dialog */}
                {showConfirmation && (
                  <div className="fixed inset-0 flex items-center justify-center z-50">
                    <div className="absolute inset-0 bg-black/50" onClick={cancelAutoBuy}></div>
                    <div className="bg-gray-900 p-6 rounded-xl shadow-xl z-10 max-w-md w-full mx-4">
                      <h3 className="text-lg font-semibold text-white mb-2">Enable Auto-buy?</h3>
                      <div className="space-y-4">
                        <p className="text-gray-300 text-sm">Please review your settings before enabling auto-buy:</p>
                        
                        <div className="bg-gray-800/50 p-4 rounded-lg space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Buy Amount:</span>
                            <span className="text-white">{buyAmount} SOL</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Slippage:</span>
                            <span className="text-white">{slippage}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Follower Check:</span>
                            <span className="text-white">{followerCheckEnabled ? `${minFollowers}+ followers` : 'Disabled'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Age Check:</span>
                            <span className="text-white">{creationTimeEnabled ? `Max ${maxCreationTime} mins` : 'Disabled'}</span>
                          </div>
                        </div>

                        <div className="flex space-x-3">
                          <button
                            onClick={confirmAutoBuy}
                            className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-medium py-2 px-4 rounded-lg transition-colors"
                          >
                            Enable
                          </button>
                          <button
                            onClick={cancelAutoBuy}
                            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Buy Amount and Slippage Settings */}
                <div className="space-y-4 bg-gray-800/50 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Buy Amount */}
                    <div className="space-y-2">
                      <label className="block text-xs text-gray-400 mb-1">Buy Amount (SOL)</label>
                      <div className="space-y-1.5">
                        <div className="relative">
                          <input
                            type="number"
                            value={buyAmount}
                            onChange={(e) => setBuyAmount(parseFloat(e.target.value) || 0)}
                            step="0.1"
                            min="0"
                            className="w-full bg-gray-700 text-gray-300 rounded px-3 py-1.5 text-right pr-8"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                            ◎
                          </span>
                        </div>
                        <div className="flex gap-1.5">
                          {PRESET_AMOUNTS.map((amount) => (
                            <button
                              key={amount}
                              onClick={() => setBuyAmount(amount)}
                              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                                buyAmount === amount
                                  ? 'bg-yellow-500/10 text-yellow-400'
                                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                              }`}
                            >
                              {amount}◎
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Slippage */}
                    <div className="space-y-2">
                      <label className="block text-xs text-gray-400 mb-1">Slippage (%)</label>
                      <div className="space-y-1.5">
                        <div className="relative">
                          <input
                            type="number"
                            value={slippage}
                            onChange={(e) => setSlippage(parseFloat(e.target.value) || 0)}
                            step="0.5"
                            min="0"
                            max="100"
                            className="w-full bg-gray-700 text-gray-300 rounded px-3 py-1.5 text-right pr-8"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                            %
                          </span>
                        </div>
                        <div className="flex gap-1.5">
                          {PRESET_SLIPPAGES.map((value) => (
                            <button
                              key={value}
                              onClick={() => setSlippage(value)}
                              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                                slippage === value
                                  ? 'bg-yellow-500/10 text-yellow-400'
                                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                              }`}
                            >
                              {value}%
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Warning for high slippage */}
                  {slippage > 10 && (
                    <div className="text-yellow-500 text-xs flex items-center space-x-1.5 bg-yellow-500/10 p-2.5 rounded">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>High slippage may result in unfavorable trades</span>
                    </div>
                  )}
                </div>

                {/* Auto-buy Filters */}
                <div className="space-y-4">
                  <div className="bg-gray-800/50 p-4 rounded-lg space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">Buy Filters</span>
                      <div className="flex space-x-3">
                        <div 
                          className="flex items-center space-x-2 cursor-pointer"
                          onClick={() => setFollowerCheckEnabled(!followerCheckEnabled)}
                        >
                          <span className="text-xs text-gray-400">Followers</span>
                          <div className="relative">
                            <input
                              type="checkbox"
                              checked={followerCheckEnabled}
                              onChange={(e) => e.stopPropagation()}
                              className="sr-only peer"
                            />
                            <div className="w-8 h-4 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-yellow-500"></div>
                          </div>
                        </div>
                        <div 
                          className="flex items-center space-x-2 cursor-pointer"
                          onClick={() => setCreationTimeEnabled(!creationTimeEnabled)}
                        >
                          <span className="text-xs text-gray-400">Age</span>
                          <div className="relative">
                            <input
                              type="checkbox"
                              checked={creationTimeEnabled}
                              onChange={(e) => e.stopPropagation()}
                              className="sr-only peer"
                            />
                            <div className="w-8 h-4 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-yellow-500"></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block mb-1.5 text-xs text-gray-400">Min. Followers</label>
                        <input
                          type="number"
                          value={minFollowers}
                          onChange={(e) => setMinFollowers(Number(e.target.value))}
                          className="w-full px-3 py-1.5 bg-gray-900 text-white border border-gray-700 rounded-lg focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 text-sm"
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="block mb-1.5 text-xs text-gray-400">Max. Age (mins)</label>
                        <input
                          type="number"
                          value={maxCreationTime}
                          onChange={(e) => setMaxCreationTime(Number(e.target.value))}
                          className="w-full px-3 py-1.5 bg-gray-900 text-white border border-gray-700 rounded-lg focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 text-sm"
                          min="1"
                          step="1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Order Status */}
                  <div className="mt-4">
                    <OrderStatus />
                  </div>
                </div>
              </div>
            </div>
          </Tab.Panel>

          {/* Lists Panel */}
          <Tab.Panel className="p-4">
            <Tab.Group>
              <Tab.List className="flex space-x-2 mb-4">
                <Tab
                  className={({ selected }) =>
                    classNames(
                      'px-4 py-2 text-sm font-medium rounded-lg focus:outline-none flex-1 transition-colors',
                      selected
                        ? 'bg-yellow-500/10 text-yellow-500'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                    )
                  }
                >
                  Blacklist ({blacklistedUsers.length})
                </Tab>
                <Tab
                  className={({ selected }) =>
                    classNames(
                      'px-4 py-2 text-sm font-medium rounded-lg focus:outline-none flex-1 transition-colors',
                      selected
                        ? 'bg-yellow-500/10 text-yellow-500'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                    )
                  }
                >
                  Buylist ({buylistedTokens.length})
                </Tab>
              </Tab.List>
              <Tab.Panels>
                <Tab.Panel className="space-y-2">
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={newBlacklistedUser}
                      onChange={(e) => setNewBlacklistedUser(e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded-lg focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 text-sm"
                      placeholder="Add new blacklisted user"
                    />
                    <button
                      onClick={() => {
                        if (newBlacklistedUser.trim()) {
                          addToBlacklist(newBlacklistedUser.trim());
                          setNewBlacklistedUser('');
                        }
                      }}
                      className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  <div className="max-h-[calc(100vh-20rem)] overflow-y-auto space-y-2">
                    {blacklistedUsers.map((user, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-gray-800/50 p-3 rounded-lg hover:bg-gray-800/70 transition-colors"
                      >
                        <span className="text-sm text-gray-200">@{user}</span>
                        <button
                          onClick={() => removeFromBlacklist(user)}
                          className="text-sm text-red-400 hover:text-red-300 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {blacklistedUsers.length === 0 && (
                      <div className="text-center py-8 text-sm text-gray-400">
                        No blacklisted users
                      </div>
                    )}
                  </div>
                </Tab.Panel>
                <Tab.Panel className="space-y-2">
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={newBuylistUser}
                      onChange={(e) => setNewBuylistUser(e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded-lg focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 text-sm"
                      placeholder="Add new buylisted user"
                    />
                    <button
                      onClick={() => {
                        if (newBuylistUser.trim()) {
                          addToBuylist(newBuylistUser.trim());
                          setNewBuylistUser('');
                        }
                      }}
                      className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  <div className="max-h-[calc(100vh-20rem)] overflow-y-auto space-y-2">
                    {buylistedTokens.map((user, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-gray-800/50 p-3 rounded-lg hover:bg-gray-800/70 transition-colors"
                      >
                        <span className="text-sm text-gray-200">@{user}</span>
                        <button
                          onClick={() => removeFromBuylist(user)}
                          className="text-sm text-red-400 hover:text-red-300 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {buylistedTokens.length === 0 && (
                      <div className="text-center py-8 text-sm text-gray-400">
                        No buylisted users
                      </div>
                    )}
                  </div>
                </Tab.Panel>
              </Tab.Panels>
            </Tab.Group>
          </Tab.Panel>

          {/* Holdings Panel */}
          <Tab.Panel className="p-4 space-y-4 bg-gray-900">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-200">Your Token Holdings</h3>
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <PurchasedTokens />
              </div>
            </div>
          </Tab.Panel>

          {/* Wallet Panel */}
          <Tab.Panel className="p-4">
            <div className="space-y-4">
              {/* Private Key Input */}
              <div className="bg-gray-800/50 p-4 rounded-lg">
                <label className="block mb-2 text-sm font-medium text-gray-200">Private Key</label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={privateKey}
                    onChange={(e) => handlePrivateKeyChange(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded-lg focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 text-sm"
                    placeholder="Enter your private key"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-200"
                  >
                    {showKey ? (
                      <EyeSlashIcon className="h-5 w-5" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
                {error && (
                  <p className="mt-2 text-sm text-red-500">{error}</p>
                )}
              </div>

              {/* Public Key Display */}
              {publicKey && (
                <div className="bg-gray-800/50 p-4 rounded-lg">
                  <label className="block mb-2 text-sm font-medium text-gray-200">Public Key</label>
                  <input
                    type="text"
                    value={publicKey}
                    readOnly
                    className="w-full px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded-lg text-sm"
                  />
                </div>
              )}

              {/* SOL Balance */}
              {solBalance !== null && (
                <div className="bg-gray-800/50 p-4 rounded-lg">
                  <label className="block mb-2 text-sm font-medium text-gray-200">SOL Balance</label>
                  <div className="text-xl font-semibold text-white">
                    {solBalance.toFixed(4)} SOL
                  </div>
                </div>
              )}

              {/* QR Code */}
              {qrCodeUrl && (
                <div className="bg-gray-800/50 p-4 rounded-lg flex flex-col items-center">
                  <label className="block mb-2 text-sm font-medium text-gray-200">Wallet QR Code</label>
                  <div className="bg-white p-2 rounded-lg">
                    <img src={qrCodeUrl} alt="Wallet QR Code" className="w-32 h-32" />
                  </div>
                </div>
              )}

              {/* Wallet Actions */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={handleGenerateWallet}
                  className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Generate New
                </button>
                <button
                  onClick={handleImportClick}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isImporting
                      ? 'bg-green-500 hover:bg-green-600 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                >
                  {isImporting ? 'Confirm Import' : 'Import Wallet'}
                </button>
              </div>
            </div>
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
};

export default TradingSettings;
