'use client';

import { useBlacklistContext } from '../contexts/BlacklistContext';
import { useState } from 'react';

export default function BlacklistManager() {
  const { blacklistedUsers, removeFromBlacklist } = useBlacklistContext();
  const [filter, setFilter] = useState('');

  const filteredUsers = blacklistedUsers.filter(user => 
    user.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <input
          type="text"
          placeholder="Search blacklisted users..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 px-3 py-2 bg-gray-800 rounded-lg border border-gray-700 focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500 text-white text-sm"
        />
      </div>

      <div className="space-y-2">
        {filteredUsers.length === 0 ? (
          <div className="text-gray-400 text-sm text-center py-4">
            {filter ? 'No matching users found' : 'No blacklisted users'}
          </div>
        ) : (
          filteredUsers.map(username => (
            <div
              key={username}
              className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700"
            >
              <span className="text-white font-medium">@{username}</span>
              <button
                onClick={() => removeFromBlacklist(username)}
                className="px-3 py-1 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/20 transition-colors"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
