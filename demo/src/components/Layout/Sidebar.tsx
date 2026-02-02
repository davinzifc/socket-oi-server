import { MessageSquare, Users, Bell, Shield } from 'lucide-react';
import type { View } from '../../types';
import { useSocket } from '../../hooks/useSocket';
import { Badge } from '../common/Badge';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

export function Sidebar({ currentView, onViewChange }: SidebarProps) {
  const { notifications } = useSocket();

  const navItems = [
    { id: 'chat' as View, icon: MessageSquare, label: 'Chat Rooms' },
    { id: 'dm' as View, icon: Users, label: 'Direct Messages' },
    { id: 'notifications' as View, icon: Bell, label: 'Notifications', badge: notifications.length },
    { id: 'admin' as View, icon: Shield, label: 'Admin Panel' },
  ];

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col">
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onViewChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition ${
                  currentView === item.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <Badge count={item.badge} />
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-gray-800">
        <p className="text-xs text-gray-500 text-center">
          SocketOi Demo v1.0
        </p>
      </div>
    </aside>
  );
}
