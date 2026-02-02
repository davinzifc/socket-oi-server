import { useState } from 'react';
import { useSocket } from '../../hooks/useSocket';
import { Zap } from 'lucide-react';

export function LoginForm() {
  const [displayName, setDisplayName] = useState('');
  const [userId, setUserId] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { connect } = useSocket();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (displayName.trim()) {
      connect(displayName.trim(), userId.trim() || undefined);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-4">
            <Zap className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">SocketOi Demo</h1>
          <p className="text-gray-500 mt-2">Connect to start chatting</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
              Display Name
            </label>
            <input
              type="text"
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              placeholder="Enter your name"
              required
            />
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-indigo-600 hover:text-indigo-800"
          >
            {showAdvanced ? 'Hide' : 'Show'} advanced options
          </button>

          {showAdvanced && (
            <div>
              <label htmlFor="userId" className="block text-sm font-medium text-gray-700 mb-1">
                User ID (optional)
              </label>
              <input
                type="text"
                id="userId"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                placeholder="Leave empty for auto-generated UUID"
              />
              <p className="text-xs text-gray-500 mt-1">
                Specify a custom userId for testing multi-device scenarios
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={!displayName.trim()}
            className="w-full py-3 px-4 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Connect
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            This demo connects to a SocketOi server running at{' '}
            <code className="bg-gray-100 px-1 rounded">localhost:3000</code>
          </p>
        </div>
      </div>
    </div>
  );
}
