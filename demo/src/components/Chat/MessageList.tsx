import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../../types';
import { Avatar } from '../common/Avatar';
import { formatTime } from '../../utils/helpers';

interface MessageListProps {
  messages: ChatMessage[];
  currentUserId: string;
}

export function MessageList({ messages, currentUserId }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p>No messages yet. Start the conversation!</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => {
        const isOwnMessage = message.senderId === currentUserId;

        return (
          <div
            key={message.id}
            className={`flex gap-3 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
          >
            <Avatar name={message.senderName} size="sm" />
            <div
              className={`max-w-[70%] ${
                isOwnMessage ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`flex items-center gap-2 mb-1 ${
                  isOwnMessage ? 'flex-row-reverse' : ''
                }`}
              >
                <span className="text-sm font-medium text-gray-900">
                  {message.senderName}
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
      })}
      <div ref={bottomRef} />
    </div>
  );
}
