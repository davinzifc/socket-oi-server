import { useState, useEffect } from 'react';
import { useSocket } from '../../hooks/useSocket';
import { ChatRoomList } from './ChatRoomList';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { Hash } from 'lucide-react';

export function ChatRoom() {
  const { currentUser, currentChatId, chatMessages, joinChat, sendChatMessage, setSection } = useSocket();
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

  const messages = selectedRoom ? chatMessages.get(selectedRoom) || [] : [];

  useEffect(() => {
    if (selectedRoom) {
      joinChat(selectedRoom);
      setSection(selectedRoom);
    }
  }, [selectedRoom, joinChat, setSection]);

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
            <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
              <Hash className="w-5 h-5 text-gray-400" />
              <h2 className="font-semibold text-gray-900">{selectedRoom}</h2>
              {currentChatId === selectedRoom && (
                <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                  Joined
                </span>
              )}
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
