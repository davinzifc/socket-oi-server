import { useEffect, useState } from 'react';
import { useSocket } from '../../hooks/useSocket';
import { useApi } from '../../hooks/useApi';
import { Avatar } from '../common/Avatar';
import { StatusIndicator } from '../common/StatusIndicator';
import { RefreshCw, Users } from 'lucide-react';
import type { User } from '../../types';

interface UserListProps {
  selectedUserId: string | null;
  onSelectUser: (userId: string, displayName: string) => void;
}

export function UserList({ selectedUserId, onSelectUser }: UserListProps) {
  const { currentUser, onlineUsers, subscribeToPresence, getDisplayName } = useSocket();
  const { api, loading, execute } = useApi();
  const [users, setUsers] = useState<User[]>([]);

  const fetchUsers = async () => {
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
    const interval = setInterval(fetchUsers, 30000);
    return () => clearInterval(interval);
  }, []);

  // Merge with registry display names and online status
  const mergedUsers = users.map((user) => {
    const onlineUser = onlineUsers.get(user.userId);
    const displayName = getDisplayName(user.userId);
    return {
      ...user,
      displayName,
      status: onlineUser?.status || user.status
    };
  });

  // Filter out current user
  const otherUsers = mergedUsers.filter((u) => u.userId !== currentUser?.userId);

  return (
    <div className="bg-gray-50 border-r border-gray-200 w-64 flex flex-col">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">Users</h2>
          <p className="text-xs text-gray-500 mt-1">{otherUsers.length} users</p>
        </div>
        <button
          onClick={fetchUsers}
          disabled={loading}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {otherUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500">
            <Users className="w-8 h-8 mb-2" />
            <p className="text-sm">No other users online</p>
          </div>
        ) : (
          otherUsers.map((user) => (
            <button
              key={user.userId}
              onClick={() => onSelectUser(user.userId, user.displayName)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition mb-1 ${
                selectedUserId === user.userId
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <div className="relative">
                <Avatar name={user.displayName} size="sm" />
                <StatusIndicator
                  status={user.status}
                  size="sm"
                  className="absolute -bottom-0.5 -right-0.5 border-2 border-gray-50"
                />
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="font-medium truncate">{user.displayName}</div>
                <div className="text-xs text-gray-500 truncate">
                  {user.status}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
