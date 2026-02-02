import { useState } from 'react';
import { useSocket } from '../../hooks/useSocket';
import { NotificationForm } from './NotificationForm';
import { Bell, Trash2, MessageSquare, Megaphone, AlertCircle } from 'lucide-react';
import { formatDateTime } from '../../utils/helpers';

export function NotificationList() {
  const { notifications, clearNotifications } = useSocket();
  const [activeTab, setActiveTab] = useState<'received' | 'send'>('received');

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'new_message':
        return <MessageSquare className="w-5 h-5 text-blue-500" />;
      case 'system_announcement':
        return <Megaphone className="w-5 h-5 text-orange-500" />;
      default:
        return <Bell className="w-5 h-5 text-indigo-500" />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">Notifications</h2>
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setActiveTab('received')}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition ${
              activeTab === 'received'
                ? 'bg-indigo-100 text-indigo-700'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            Received ({notifications.length})
          </button>
          <button
            onClick={() => setActiveTab('send')}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition ${
              activeTab === 'send'
                ? 'bg-indigo-100 text-indigo-700'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            Send Notification
          </button>
        </div>
      </div>

      {activeTab === 'received' ? (
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <AlertCircle className="w-12 h-12 mb-4 text-gray-300" />
              <p className="font-medium">No notifications</p>
              <p className="text-sm mt-1">You'll see notifications here when you receive them</p>
            </div>
          ) : (
            <>
              <div className="p-2 border-b border-gray-100">
                <button
                  onClick={clearNotifications}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear all
                </button>
              </div>
              <div className="p-4 space-y-3">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="p-4 bg-gray-50 rounded-lg border border-gray-100"
                  >
                    <div className="flex items-start gap-3">
                      {getNotificationIcon(notification.type)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-gray-500 uppercase">
                            {notification.type.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatDateTime(new Date(notification.timestamp))}
                          </span>
                        </div>
                        {notification.title && (
                          <h4 className="font-medium text-gray-900 mt-1">
                            {notification.title}
                          </h4>
                        )}
                        <p className="text-gray-700 mt-1">{notification.message}</p>
                        {notification.data && Object.keys(notification.data).length > 0 && (
                          <pre className="text-xs bg-gray-100 p-2 rounded mt-2 overflow-x-auto">
                            {JSON.stringify(notification.data, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <NotificationForm />
      )}
    </div>
  );
}
