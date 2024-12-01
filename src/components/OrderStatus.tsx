'use client';

import React from 'react';
import { useTradingContext } from '../contexts/TradingContext';
import { formatDistanceToNow } from 'date-fns';

const StatusIcon = ({ status }: { status: string }) => {
  if (status === 'pending') {
    return (
      <svg className="w-4 h-4 text-yellow-500 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
      </svg>
    );
  }
  if (status === 'success') {
    return (
      <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
};

export default function OrderStatus() {
  const { orders } = useTradingContext();

  // Filter out removed orders
  const activeOrders = orders.filter(order => order.status !== 'removed');

  if (activeOrders.length === 0) {
    return (
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <div className="text-center py-6">
          <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="text-gray-400 text-sm font-medium">No Recent Orders</h3>
          <p className="text-gray-500 text-xs mt-1">Your trading activity will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 shadow-lg">
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Recent Orders</h3>
          <span className="text-xs text-gray-400 px-2 py-1 bg-gray-800 rounded-full">
            {activeOrders.length} {activeOrders.length === 1 ? 'Order' : 'Orders'}
          </span>
        </div>
      </div>

      <div className="divide-y divide-gray-800">
        {activeOrders.map((order) => (
          <div
            key={order.id}
            className={`p-4 hover:bg-gray-800/50 transition-colors ${
              order.status === 'pending' ? 'bg-yellow-500/5' :
              order.status === 'success' ? 'bg-green-500/5' :
              'bg-red-500/5'
            }`}
          >
            <div className="flex items-start justify-between space-x-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <StatusIcon status={order.status} />
                  <span className="text-gray-200 font-medium truncate">
                    {order.tokenSymbol} - {order.tokenName}
                  </span>
                </div>
                <div className="mt-1 flex items-center space-x-2 text-sm">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                    ${order.type === 'buy' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}
                  `}>
                    {order.type.toUpperCase()}
                  </span>
                  <span className="text-gray-400">{order.amount} SOL</span>
                </div>
              </div>

              <div className="text-right">
                <div className={`text-sm font-medium
                  ${order.status === 'pending' ? 'text-yellow-500' :
                    order.status === 'success' ? 'text-green-500' :
                    'text-red-500'}
                `}>
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {formatDistanceToNow(order.timestamp, { addSuffix: true })}
                </div>
              </div>
            </div>

            {(order.signature || order.error) && (
              <div className="mt-3 flex items-center justify-between text-xs">
                {order.signature && (
                  <a
                    href={`https://solscan.io/tx/${order.signature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1 text-yellow-500 hover:text-yellow-400 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <span>View on Solscan</span>
                  </a>
                )}
                {order.error && (
                  <div className="flex items-center space-x-1 text-red-400">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{order.error}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
