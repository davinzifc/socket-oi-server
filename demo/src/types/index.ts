export interface User {
  userId: string;
  displayName: string;
  status: 'ONLINE' | 'IDLE' | 'OFFLINE';
  currentSection?: string;
  socketCount?: number;
  lastSeen?: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
}

export interface DirectMessage {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  content: string;
  timestamp: Date;
}

export interface Notification {
  id: string;
  type: 'new_message' | 'system_announcement' | 'notification';
  title?: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: Date;
}

export interface ChatRoom {
  id: string;
  name: string;
  userCount: number;
}

export interface PresenceEvent {
  userId: string;
  displayName?: string;
  status?: string;
  chatId?: string;
  timestamp?: string;
}

export interface ConnectionState {
  isConnected: boolean;
  userId: string | null;
  displayName: string | null;
}

export interface SendNotificationPayload {
  userId: string;
  eventType: string;
  payload: {
    title?: string;
    message: string;
    data?: Record<string, unknown>;
  };
}

export interface SendMultipleNotificationPayload {
  userIds: string[];
  eventType: string;
  payload: {
    title?: string;
    message: string;
    data?: Record<string, unknown>;
  };
}

export interface SendSectionNotificationPayload {
  section: string;
  eventType: string;
  payload: {
    title?: string;
    message: string;
    data?: Record<string, unknown>;
  };
}

export interface SendChatNotificationPayload {
  chatId: string;
  eventType: string;
  payload: {
    title?: string;
    message: string;
    data?: Record<string, unknown>;
  };
}

export interface BroadcastNotificationPayload {
  eventType: string;
  payload: {
    title?: string;
    message: string;
    data?: Record<string, unknown>;
  };
}

export type View = 'chat' | 'dm' | 'notifications' | 'admin';
