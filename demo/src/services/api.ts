const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `HTTP error ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Presence endpoints
  getOnlineUsers: () =>
    request<{
      users: Array<{
        userId: string;
        status: string;
        lastSeenAt: string | null;
        presenceVersion: number;
      }>;
      count: number;
    }>('/presence/online/detailed'),

  getChatUsers: (chatId: string) =>
    request<{
      chatId: string;
      users: Array<{
        odUserId: string;
        displayName: string;
        joinedAt: string;
      }>;
      count: number;
    }>(`/presence/chat/${chatId}`),

  // Admin endpoints
  disconnectUser: (userId: string) =>
    request<{ success: boolean; message: string }>(
      `/admin/presence/disconnect/${userId}`,
      { method: 'POST' }
    ),

  // Notification endpoints - server expects 'event' and 'data' fields
  sendNotification: (data: {
    userId: string;
    event: string;
    data: Record<string, unknown>;
  }) =>
    request<{ queued: boolean }>('/notifications/send', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  sendMultipleNotifications: (data: {
    userIds: string[];
    event: string;
    data: Record<string, unknown>;
  }) =>
    request<{ queued: boolean; count: number }>('/notifications/send-multiple', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  sendSectionNotification: (data: {
    section: string;
    event: string;
    data: Record<string, unknown>;
  }) =>
    request<{ queued: boolean }>('/notifications/send-section', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  sendChatNotification: (data: {
    chatId: string;
    event: string;
    data: Record<string, unknown>;
  }) =>
    request<{ queued: boolean }>('/notifications/send-chat', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  broadcastNotification: (data: {
    event: string;
    data: Record<string, unknown>;
  }) =>
    request<{ queued: boolean }>('/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
