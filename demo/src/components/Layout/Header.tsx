import { useSocket } from '../../hooks/useSocket';
import { LogOut, Zap, Wifi, WifiOff } from 'lucide-react';

export function Header() {
  const { currentUser, isConnected, disconnect } = useSocket();

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-indigo-600" />
            <span className="font-bold text-xl text-gray-900">SocketOi</span>
          </div>
          <span className="text-gray-400">|</span>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <Wifi className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-600">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-red-500" />
                <span className="text-sm text-red-600">Disconnected</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {currentUser && (
            <span className="text-sm text-gray-600">
              Logged in as <strong>{currentUser.displayName}</strong>
            </span>
          )}
          <button
            onClick={disconnect}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
          >
            <LogOut className="w-4 h-4" />
            Disconnect
          </button>
        </div>
      </div>
    </header>
  );
}
