import { useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { Send, CheckCircle, AlertCircle } from 'lucide-react';

type NotificationType = 'single' | 'multiple' | 'section' | 'chat' | 'broadcast';

export function NotificationForm() {
  const { api, loading, error, execute, clearError } = useApi();
  const [type, setType] = useState<NotificationType>('single');
  const [userId, setUserId] = useState('');
  const [userIds, setUserIds] = useState('');
  const [section, setSection] = useState('');
  const [chatId, setChatId] = useState('');
  const [event, setEvent] = useState('notification');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSuccess(false);

    // Server expects 'data' as an object with the notification content
    const data: Record<string, unknown> = {
      message,
    };
    if (title) {
      data.title = title;
    }

    let result;

    switch (type) {
      case 'single':
        result = await execute(() =>
          api.sendNotification({ userId, event, data })
        );
        break;
      case 'multiple':
        result = await execute(() =>
          api.sendMultipleNotifications({
            userIds: userIds.split(',').map((id) => id.trim()).filter(Boolean),
            event,
            data,
          })
        );
        break;
      case 'section':
        result = await execute(() =>
          api.sendSectionNotification({ section, event, data })
        );
        break;
      case 'chat':
        result = await execute(() =>
          api.sendChatNotification({ chatId, event, data })
        );
        break;
      case 'broadcast':
        result = await execute(() =>
          api.broadcastNotification({ event, data })
        );
        break;
    }

    if (result) {
      setSuccess(true);
      setMessage('');
      setTitle('');
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <form onSubmit={handleSubmit} className="max-w-lg mx-auto space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Notification Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'single', label: 'Single User' },
              { value: 'multiple', label: 'Multiple Users' },
              { value: 'section', label: 'Section' },
              { value: 'chat', label: 'Chat Room' },
              { value: 'broadcast', label: 'Broadcast' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setType(option.value as NotificationType)}
                className={`px-3 py-2 text-sm font-medium rounded-lg border transition ${
                  type === option.value
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {type === 'single' && (
          <div>
            <label htmlFor="userId" className="block text-sm font-medium text-gray-700 mb-1">
              User ID
            </label>
            <input
              type="text"
              id="userId"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="Enter user ID"
              required
            />
          </div>
        )}

        {type === 'multiple' && (
          <div>
            <label htmlFor="userIds" className="block text-sm font-medium text-gray-700 mb-1">
              User IDs (comma-separated)
            </label>
            <input
              type="text"
              id="userIds"
              value={userIds}
              onChange={(e) => setUserIds(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="user1, user2, user3"
              required
            />
          </div>
        )}

        {type === 'section' && (
          <div>
            <label htmlFor="section" className="block text-sm font-medium text-gray-700 mb-1">
              Section
            </label>
            <select
              id="section"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              required
            >
              <option value="">Select a section</option>
              <option value="general">General</option>
              <option value="support">Support</option>
              <option value="random">Random</option>
            </select>
          </div>
        )}

        {type === 'chat' && (
          <div>
            <label htmlFor="chatId" className="block text-sm font-medium text-gray-700 mb-1">
              Chat Room
            </label>
            <select
              id="chatId"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              required
            >
              <option value="">Select a chat room</option>
              <option value="general">General</option>
              <option value="support">Support</option>
              <option value="random">Random</option>
            </select>
          </div>
        )}

        <div>
          <label htmlFor="event" className="block text-sm font-medium text-gray-700 mb-1">
            Event Type
          </label>
          <select
            id="event"
            value={event}
            onChange={(e) => setEvent(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          >
            <option value="notification">notification</option>
            <option value="new_message">new_message</option>
            <option value="system_announcement">system_announcement</option>
          </select>
        </div>

        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Title (optional)
          </label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            placeholder="Notification title"
          />
        </div>

        <div>
          <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
            Message
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
            placeholder="Enter your message"
            required
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-lg">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm">Notification sent successfully!</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !message.trim()}
          className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              Send Notification
            </>
          )}
        </button>
      </form>
    </div>
  );
}
