import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { useSocket } from '../../hooks/useSocket';
import { UserTable } from './UserTable';
import { RefreshCw, Users, AlertCircle, Shield } from 'lucide-react';
import type { User } from '../../types';

export function AdminPanel() {
  const { api, loading, error, execute, clearError } = useApi();
  const { onlineUsers, subscribeToPresence, getDisplayName } = useSocket();
  const [users, setUsers] = useState<User[]>([]);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const fetchUsers = async () => {
    clearError();
    const result = await execute(() => api.getOnlineUsers());
    if (result) {
      const fetchedUsers: User[] = result.users.map((u) => ({
        userId: u.userId,
        displayName: getDisplayName(u.userId),
        status: u.status as 'ONLINE' | 'IDLE' | 'OFFLINE',
        lastSeen: u.lastSeenAt || undefined,
      }));
      setUsers(fetchedUsers);

      const userIds = fetchedUsers.map((u) => u.userId);
      subscribeToPresence(userIds);
    }
  };

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 10000);
    return () => clearInterval(interval);
  }, []);

  // Merge with updated display names and status
  const mergedUsers = users.map((user) => {
    const onlineUser = onlineUsers.get(user.userId);
    const displayName = getDisplayName(user.userId);
    return {
      ...user,
      displayName,
      status: onlineUser?.status || user.status
    };
  });

  const handleDisconnect = async (userId: string) => {
    setDisconnecting(userId);
    try {
      const result = await execute(() => api.disconnectUser(userId));
      if (result?.success) {
        setUsers((prev) => prev.filter((u) => u.userId !== userId));
      }
    } finally {
      setDisconnecting(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="font-semibold text-gray-900">Admin Panel</h2>
              <p className="text-xs text-gray-500">Manage connected users</p>
            </div>
          </div>
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-lg">
            <Users className="w-5 h-5 text-indigo-600" />
            <span className="text-sm font-medium text-indigo-900">
              {mergedUsers.length} Users Connected
            </span>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg mb-4">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="bg-white border border-gray-200 rounded-lg">
          <UserTable
            users={mergedUsers}
            onDisconnect={handleDisconnect}
            disconnecting={disconnecting}
          />
        </div>
      </div>
    </div>
  );
}
