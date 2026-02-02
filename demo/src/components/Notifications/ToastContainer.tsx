import { useEffect, useState } from 'react';
import { useSocket } from '../../hooks/useSocket';
import type { Notification } from '../../types';
import { X, Bell, MessageSquare, Megaphone, AlertTriangle } from 'lucide-react';

interface Toast extends Notification {
  visible: boolean;
}

export function ToastContainer() {
  const { notifications } = useSocket();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modalNotification, setModalNotification] = useState<Notification | null>(null);

  useEffect(() => {
    if (notifications.length > 0) {
      const latest = notifications[0];
      // Check if this notification is already shown
      if (!toasts.find((t) => t.id === latest.id)) {
        // Show modal popup for all notifications
        setModalNotification(latest);

        // Also add to toast list
        setToasts((prev) => [...prev, { ...latest, visible: true }]);

        // Auto-dismiss toast after 5 seconds
        setTimeout(() => {
          dismissToast(latest.id);
        }, 5000);
      }
    }
  }, [notifications]);

  const dismissToast = (id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, visible: false } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  };

  const closeModal = () => {
    setModalNotification(null);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'new_message':
        return <MessageSquare className="w-6 h-6 text-blue-500" />;
      case 'system_announcement':
        return <Megaphone className="w-6 h-6 text-orange-500" />;
      default:
        return <Bell className="w-6 h-6 text-indigo-500" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'new_message':
        return 'New Message';
      case 'system_announcement':
        return 'System Announcement';
      default:
        return 'Notification';
    }
  };

  return (
    <>
      {/* Modal Popup for Notifications */}
      {modalNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full animate-bounce-in overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white bg-opacity-20 rounded-full p-2">
                  <AlertTriangle className="w-5 h-5 text-white" />
                </div>
                <span className="text-white font-semibold text-lg">
                  {getTypeLabel(modalNotification.type)}
                </span>
              </div>
              <button
                onClick={closeModal}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-1 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 bg-gray-100 rounded-full p-3">
                  {getIcon(modalNotification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  {modalNotification.title && (
                    <h3 className="font-bold text-gray-900 text-lg mb-2">
                      {modalNotification.title}
                    </h3>
                  )}
                  <p className="text-gray-700 text-base">
                    {modalNotification.message}
                  </p>
                  {modalNotification.data && Object.keys(modalNotification.data).length > 0 && (
                    <pre className="mt-3 text-xs bg-gray-100 p-3 rounded-lg overflow-x-auto text-gray-600">
                      {JSON.stringify(modalNotification.data, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 flex justify-end">
              <button
                onClick={closeModal}
                className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications in corner */}
      <div className="fixed bottom-4 right-4 z-40 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`bg-white rounded-lg shadow-lg border border-gray-200 p-4 max-w-sm transform transition-all duration-300 ${
              toast.visible
                ? 'translate-x-0 opacity-100'
                : 'translate-x-full opacity-0'
            }`}
          >
            <div className="flex items-start gap-3">
              {getIcon(toast.type)}
              <div className="flex-1 min-w-0">
                {toast.title && (
                  <h4 className="font-medium text-gray-900 text-sm">{toast.title}</h4>
                )}
                <p className="text-sm text-gray-600 mt-0.5">{toast.message}</p>
              </div>
              <button
                onClick={() => dismissToast(toast.id)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
