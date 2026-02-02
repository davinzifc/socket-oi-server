import { useState, useEffect } from 'react';
import { useSocket } from '../../hooks/useSocket';
import { ChatRoomList } from './ChatRoomList';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { Hash, Users } from 'lucide-react';

export function ChatRoom() {
  const { currentUser, currentChatId, chatMessages, joinChat, sendChatMessage, setSection, chatUserCounts, fetchChatUsers, chatUsers } = useSocket();
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

  const messages = selectedRoom ? chatMessages.get(selectedRoom) || [] : [];
  const currentRoomUserCount = selectedRoom ? chatUserCounts.get(selectedRoom) || 0 : 0;
  const currentRoomUsers = selectedRoom ? chatUsers.get(selectedRoom) || [] : [];

  useEffect(() => {
    if (selectedRoom) {
      joinChat(selectedRoom);
      setSection(selectedRoom);
      // Obtener usuarios iniciales del chat via API
      fetchChatUsers(selectedRoom);
    }
  }, [selectedRoom, joinChat, setSection, fetchChatUsers]);

  const handleSendMessage = (content: string) => {
    if (selectedRoom) {
      sendChatMessage(selectedRoom, content);
    }
  };

  return (
    <div className="h-full flex">
      <ChatRoomList
        selectedRoom={selectedRoom}
        onSelectRoom={setSelectedRoom}
      />

      <div className="flex-1 flex flex-col bg-white">
        {selectedRoom ? (
          <>
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hash className="w-5 h-5 text-gray-400" />
                <h2 className="font-semibold text-gray-900">{selectedRoom}</h2>
                {currentChatId === selectedRoom && (
                  <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                    Joined
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                  <Users className="w-4 h-4" />
                  <span className="font-medium">{currentRoomUserCount}</span>
                  <span className="text-gray-500">online</span>
                </div>
                {currentRoomUsers.length > 0 && (
                  <div className="relative group">
                    <button className="text-xs text-indigo-600 hover:text-indigo-800">
                      View users
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg p-2 hidden group-hover:block z-10">
                      <div className="text-xs text-gray-500 mb-2 font-medium">Users in chat:</div>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {currentRoomUsers.map((user) => (
                          <div key={user.odUserId} className="flex items-center gap-2 text-sm">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span className="truncate">{user.displayName || user.odUserId}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <MessageList
              messages={messages}
              currentUserId={currentUser?.userId || ''}
            />

            <MessageInput
              onSend={handleSendMessage}
              placeholder={`Message #${selectedRoom}`}
              disabled={currentChatId !== selectedRoom}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <Hash className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="font-medium">Select a room to start chatting</p>
              <p className="text-sm mt-1">Choose from the list on the left</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
