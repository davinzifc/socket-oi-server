import { Hash, Users } from 'lucide-react';
import { useSocket } from '../../hooks/useSocket';

const AVAILABLE_ROOMS = [
  { id: 'general', name: 'General', description: 'General discussion' },
  { id: 'support', name: 'Support', description: 'Get help here' },
  { id: 'random', name: 'Random', description: 'Off-topic chat' },
];

interface ChatRoomListProps {
  selectedRoom: string | null;
  onSelectRoom: (roomId: string) => void;
}

export function ChatRoomList({ selectedRoom, onSelectRoom }: ChatRoomListProps) {
  const { chatUserCounts } = useSocket();

  return (
    <div className="bg-gray-50 border-r border-gray-200 w-64 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">Chat Rooms</h2>
        <p className="text-xs text-gray-500 mt-1">Select a room to join</p>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {AVAILABLE_ROOMS.map((room) => (
          <button
            key={room.id}
            onClick={() => onSelectRoom(room.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition mb-1 ${
              selectedRoom === room.id
                ? 'bg-indigo-100 text-indigo-700'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <Hash className="w-5 h-5 text-gray-400" />
            <div className="flex-1 text-left">
              <div className="font-medium">{room.name}</div>
              <div className="text-xs text-gray-500">{room.description}</div>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Users className="w-3 h-3" />
              <span>{chatUserCounts.get(room.id) || 0}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
