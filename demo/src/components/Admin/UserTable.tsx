import type { User } from '../../types';
import { StatusIndicator } from '../common/StatusIndicator';
import { Avatar } from '../common/Avatar';
import { Power, Loader2 } from 'lucide-react';

interface UserTableProps {
  users: User[];
  onDisconnect: (userId: string) => void;
  disconnecting: string | null;
}

export function UserTable({ users, onDisconnect, disconnecting }: UserTableProps) {
  if (users.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No users connected</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">User</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">User ID</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Last Seen</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.userId} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <Avatar name={user.displayName} size="sm" />
                  <span className="font-medium text-gray-900">{user.displayName}</span>
                </div>
              </td>
              <td className="py-3 px-4">
                <code className="text-xs bg-gray-100 px-2 py-1 rounded">{user.userId}</code>
              </td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <StatusIndicator status={user.status} size="sm" />
                  <span className="text-sm text-gray-600">{user.status}</span>
                </div>
              </td>
              <td className="py-3 px-4">
                <span className="text-sm text-gray-600">
                  {user.lastSeen ? new Date(user.lastSeen).toLocaleTimeString() : '-'}
                </span>
              </td>
              <td className="py-3 px-4 text-right">
                <button
                  onClick={() => onDisconnect(user.userId)}
                  disabled={disconnecting === user.userId}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                >
                  {disconnecting === user.userId ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Power className="w-4 h-4" />
                  )}
                  Disconnect
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
