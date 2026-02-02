import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../../hooks/useSocket';
import { UserList } from './UserList';
import { MessageInput } from '../Chat/MessageInput';
import { Avatar } from '../common/Avatar';
import { formatTime } from '../../utils/helpers';
import { MessageCircle } from 'lucide-react';

export function DMConversation() {
  const { currentUser, directMessages, sendDirectMessage, getDisplayName } = useSocket();
  const [selectedUser, setSelectedUser] = useState<{ userId: string; displayName: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = selectedUser ? directMessages.get(selectedUser.userId) || [] : [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (content: string) => {
    if (selectedUser) {
      sendDirectMessage(selectedUser.userId, content);
    }
  };

  const handleSelectUser = (userId: string, _displayName: string) => {
    // Use registry to get most up-to-date name
    const actualDisplayName = getDisplayName(userId);
    setSelectedUser({ userId, displayName: actualDisplayName });
  };

  // Update selected user's display name if it changes
  const displayName = selectedUser ? getDisplayName(selectedUser.userId) : '';

  return (
    <div className="h-full flex">
      <UserList
        selectedUserId={selectedUser?.userId || null}
        onSelectUser={handleSelectUser}
      />

      <div className="flex-1 flex flex-col bg-white">
        {selectedUser ? (
          <>
            <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3">
              <Avatar name={displayName} size="sm" />
              <div>
                <h2 className="font-semibold text-gray-900">{displayName}</h2>
                <p className="text-xs text-gray-500">Direct Message</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-500 h-full">
                  <div className="text-center">
                    <MessageCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No messages yet</p>
                    <p className="text-sm mt-1">Start a conversation with {displayName}</p>
                  </div>
                </div>
              ) : (
                messages.map((message) => {
                  const isOwnMessage = message.fromUserId === currentUser?.userId;
                  const msgSenderName = isOwnMessage
                    ? currentUser!.displayName
                    : getDisplayName(message.fromUserId);

                  return (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
                    >
                      <Avatar name={msgSenderName} size="sm" />
                      <div className={`max-w-[70%] ${isOwnMessage ? 'items-end' : 'items-start'}`}>
                        <div
                          className={`flex items-center gap-2 mb-1 ${
                            isOwnMessage ? 'flex-row-reverse' : ''
                          }`}
                        >
                          <span className="text-sm font-medium text-gray-900">
                            {isOwnMessage ? 'You' : msgSenderName}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatTime(new Date(message.timestamp))}
                          </span>
                        </div>
                        <div
                          className={`px-4 py-2 rounded-2xl ${
                            isOwnMessage
                              ? 'bg-indigo-600 text-white rounded-br-md'
                              : 'bg-gray-100 text-gray-900 rounded-bl-md'
                          }`}
                        >
                          {message.content}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <MessageInput
              onSend={handleSendMessage}
              placeholder={`Message ${displayName}`}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <MessageCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="font-medium">Select a user to start a conversation</p>
              <p className="text-sm mt-1">Choose from the list on the left</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
