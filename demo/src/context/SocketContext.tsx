import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { User, ChatMessage, DirectMessage, Notification, PresenceEvent } from '../types';
import { generateUUID } from '../utils/helpers';
import { api } from '../services/api';

interface ChatUser {
  odUserId: string;
  displayName: string;
  joinedAt: string;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  currentUser: { userId: string; displayName: string } | null;
  onlineUsers: Map<string, User>;
  userRegistry: Map<string, string>; // userId -> displayName
  chatMessages: Map<string, ChatMessage[]>;
  directMessages: Map<string, DirectMessage[]>;
  notifications: Notification[];
  currentChatId: string | null;
  chatUserCounts: Map<string, number>;
  chatUsers: Map<string, ChatUser[]>; // Lista de usuarios por chat
  getDisplayName: (userId: string) => string;
  connect: (displayName: string, userId?: string) => void;
  disconnect: () => void;
  joinChat: (chatId: string) => void;
  leaveChat: (chatId: string) => void;
  sendChatMessage: (chatId: string, content: string) => void;
  sendDirectMessage: (toUserId: string, content: string) => void;
  setSection: (section: string) => void;
  subscribeToPresence: (userIds: string[]) => void;
  clearNotifications: () => void;
  fetchChatUsers: (chatId: string) => Promise<void>;
}

const SocketContext = createContext<SocketContextType | null>(null);

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';
const HEARTBEAT_INTERVAL = 20000;

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const currentUserRef = useRef<{ userId: string; displayName: string } | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ userId: string; displayName: string } | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Map<string, User>>(new Map());
  const [userRegistry, setUserRegistry] = useState<Map<string, string>>(new Map());
  const [chatMessages, setChatMessages] = useState<Map<string, ChatMessage[]>>(new Map());
  const [directMessages, setDirectMessages] = useState<Map<string, DirectMessage[]>>(new Map());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [chatUserCounts, setChatUserCounts] = useState<Map<string, number>>(new Map());
  const [chatUsers, setChatUsers] = useState<Map<string, ChatUser[]>>(new Map());

  // Mantener referencia sincronizada para usar en callbacks
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Get display name for a user (from registry or fallback to userId)
  const getDisplayName = useCallback((userId: string) => {
    if (currentUser && userId === currentUser.userId) {
      return currentUser.displayName;
    }
    return userRegistry.get(userId) || onlineUsers.get(userId)?.displayName || userId;
  }, [currentUser, userRegistry, onlineUsers]);

  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
    }
    heartbeatRef.current = setInterval(() => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('presence:heartbeat');
      }
    }, HEARTBEAT_INTERVAL);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const connect = useCallback((displayName: string, userId?: string) => {
    const finalUserId = userId || generateUUID();

    const socket = io(SOCKET_URL, {
      query: {
        userId: finalUserId,
        displayName: displayName,
      },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      setIsConnected(true);
      setCurrentUser({ userId: finalUserId, displayName });
      // Register self in the registry
      setUserRegistry((prev) => {
        const next = new Map(prev);
        next.set(finalUserId, displayName);
        return next;
      });
      startHeartbeat();
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      stopHeartbeat();
    });

    // Presence events
    socket.on('presence:user_online', (data: PresenceEvent) => {
      setOnlineUsers((prev) => {
        const next = new Map(prev);
        const existingName = userRegistry.get(data.userId);
        next.set(data.userId, {
          userId: data.userId,
          displayName: existingName || data.displayName || data.userId,
          status: 'ONLINE',
        });
        return next;
      });
    });

    socket.on('presence:user_offline', (data: PresenceEvent) => {
      setOnlineUsers((prev) => {
        const next = new Map(prev);
        const user = next.get(data.userId);
        if (user) {
          next.set(data.userId, { ...user, status: 'OFFLINE' });
        }
        return next;
      });
    });

    socket.on('presence:user_connected', (data: PresenceEvent) => {
      setOnlineUsers((prev) => {
        const next = new Map(prev);
        const existing = next.get(data.userId);
        const existingName = userRegistry.get(data.userId);
        if (existing) {
          next.set(data.userId, { ...existing, status: 'ONLINE' });
        } else {
          next.set(data.userId, {
            userId: data.userId,
            displayName: existingName || data.displayName || data.userId,
            status: 'ONLINE',
          });
        }
        return next;
      });
    });

    socket.on('presence:user_disconnected', (data: PresenceEvent) => {
      console.log('User socket disconnected:', data.userId);
    });

    // Eventos de presencia por chat (room-scoped) - estos los reciben todos los clientes en el chat
    socket.on('presence:chat_user_joined', (data: { userId: string; socketId: string; chatId: string; ts: string; reason: string; displayName?: string }) => {
      console.log('Chat user joined:', data);
      setChatUserCounts((prev) => {
        const next = new Map(prev);
        next.set(data.chatId, (prev.get(data.chatId) || 0) + 1);
        return next;
      });
      // Agregar usuario a la lista
      setChatUsers((prev) => {
        const next = new Map(prev);
        const users = next.get(data.chatId) || [];
        // Evitar duplicados
        if (!users.find(u => u.odUserId === data.userId)) {
          next.set(data.chatId, [...users, {
            odUserId: data.userId,
            displayName: data.displayName || data.userId,
            joinedAt: data.ts,
          }]);
        }
        return next;
      });
    });

    socket.on('presence:chat_user_left', (data: { userId: string; socketId: string; chatId: string; ts: string; reason: string }) => {
      console.log('Chat user left:', data);
      setChatUserCounts((prev) => {
        const next = new Map(prev);
        const current = prev.get(data.chatId) || 0;
        next.set(data.chatId, Math.max(0, current - 1));
        return next;
      });
      // Remover usuario de la lista
      setChatUsers((prev) => {
        const next = new Map(prev);
        const users = next.get(data.chatId) || [];
        next.set(data.chatId, users.filter(u => u.odUserId !== data.userId));
        return next;
      });
    });

    // Eventos para watchers/admins - solo logging, NO actualizar conteos
    // (los conteos se actualizan via presence:chat_user_joined/left que son room-scoped)
    socket.on('presence:chat_joined', (data: { userId: string; chatId: string; displayName?: string }) => {
      console.log('Watcher: Chat joined:', data);
      // NO incrementar conteo aquí - ya se hace en presence:chat_user_joined
    });

    socket.on('presence:chat_left', (data: { userId: string; chatId: string }) => {
      console.log('Watcher: Chat left:', data);
      // NO decrementar conteo aquí - ya se hace en presence:chat_user_left
    });

    // Chat messages
    socket.on('chat_message', (data: { messageId: string; fromUserId: string; chatId: string; ts: string; data?: { text?: string; senderName?: string } }) => {
      const senderName = data.data?.senderName || data.fromUserId;

      // Register the sender's displayName
      if (data.data?.senderName) {
        setUserRegistry((prev) => {
          const next = new Map(prev);
          next.set(data.fromUserId, data.data!.senderName!);
          return next;
        });
      }

      const newMessage: ChatMessage = {
        id: data.messageId || generateUUID(),
        chatId: data.chatId,
        senderId: data.fromUserId,
        senderName,
        content: data.data?.text || '',
        timestamp: new Date(data.ts),
      };
      setChatMessages((prev) => {
        const next = new Map(prev);
        const messages = next.get(data.chatId) || [];
        next.set(data.chatId, [...messages, newMessage]);
        return next;
      });
    });

    // Direct messages
    socket.on('dm_message', (data: { messageId: string; fromUserId: string; toUserId: string; ts: string; data?: { text?: string; senderName?: string } }) => {
      const senderName = data.data?.senderName || data.fromUserId;

      // Register the sender's displayName
      if (data.data?.senderName) {
        setUserRegistry((prev) => {
          const next = new Map(prev);
          next.set(data.fromUserId, data.data!.senderName!);
          return next;
        });
      }

      const newDM: DirectMessage = {
        id: data.messageId || generateUUID(),
        fromUserId: data.fromUserId,
        fromUserName: senderName,
        toUserId: data.toUserId,
        content: data.data?.text || '',
        timestamp: new Date(data.ts),
      };
      setDirectMessages((prev) => {
        const next = new Map(prev);
        const messages = next.get(data.fromUserId) || [];
        next.set(data.fromUserId, [...messages, newDM]);
        return next;
      });
    });

    // Notifications
    const handleNotification = (type: Notification['type']) => (data: { title?: string; message: string; data?: Record<string, unknown> }) => {
      const notification: Notification = {
        id: generateUUID(),
        type,
        title: data.title,
        message: data.message,
        data: data.data,
        timestamp: new Date(),
      };
      setNotifications((prev) => [notification, ...prev]);
    };

    socket.on('new_message', handleNotification('new_message'));
    socket.on('system_announcement', handleNotification('system_announcement'));
    socket.on('notification', handleNotification('notification'));

    socketRef.current = socket;
  }, [startHeartbeat, stopHeartbeat, userRegistry]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    stopHeartbeat();
    setIsConnected(false);
    setCurrentUser(null);
    setOnlineUsers(new Map());
    setUserRegistry(new Map());
    setChatMessages(new Map());
    setDirectMessages(new Map());
    setNotifications([]);
    setCurrentChatId(null);
    setChatUserCounts(new Map());
    setChatUsers(new Map());
  }, [stopHeartbeat]);

  const joinChat = useCallback((chatId: string) => {
    if (socketRef.current) {
      // Si estaba en otro chat, salir primero
      if (currentChatId && currentChatId !== chatId) {
        socketRef.current.emit('chat:leave', { chatId: currentChatId });
        // Decrementar conteo local del chat anterior (no recibimos el evento de nuestra propia salida)
        setChatUserCounts((prev) => {
          const next = new Map(prev);
          const current = prev.get(currentChatId) || 0;
          next.set(currentChatId, Math.max(0, current - 1));
          return next;
        });
        // Remover nuestro usuario de la lista del chat anterior
        const myUserId = currentUserRef.current?.userId;
        if (myUserId) {
          setChatUsers((prev) => {
            const next = new Map(prev);
            const users = next.get(currentChatId) || [];
            next.set(currentChatId, users.filter(u => u.odUserId !== myUserId));
            return next;
          });
        }
      }

      // Unirse al nuevo chat
      socketRef.current.emit('chat:join', { chatId });
      setCurrentChatId(chatId);

      // Incrementar conteo local del nuevo chat (no recibimos el evento de nuestro propio join)
      setChatUserCounts((prev) => {
        const next = new Map(prev);
        next.set(chatId, (prev.get(chatId) || 0) + 1);
        return next;
      });
      // Agregar nuestro usuario a la lista del nuevo chat
      const myUserId = currentUserRef.current?.userId;
      const myDisplayName = currentUserRef.current?.displayName;
      if (myUserId) {
        setChatUsers((prev) => {
          const next = new Map(prev);
          const users = next.get(chatId) || [];
          // Evitar duplicados
          if (!users.find(u => u.odUserId === myUserId)) {
            next.set(chatId, [...users, {
              odUserId: myUserId,
              displayName: myDisplayName || myUserId,
              joinedAt: new Date().toISOString(),
            }]);
          }
          return next;
        });
      }
    }
  }, [currentChatId]);

  const leaveChat = useCallback((chatId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('chat:leave', { chatId });
      // Decrementar conteo local (no recibimos el evento de nuestra propia salida)
      setChatUserCounts((prev) => {
        const next = new Map(prev);
        const current = prev.get(chatId) || 0;
        next.set(chatId, Math.max(0, current - 1));
        return next;
      });
      // Remover nuestro usuario de la lista
      const myUserId = currentUserRef.current?.userId;
      if (myUserId) {
        setChatUsers((prev) => {
          const next = new Map(prev);
          const users = next.get(chatId) || [];
          next.set(chatId, users.filter(u => u.odUserId !== myUserId));
          return next;
        });
      }
      if (currentChatId === chatId) {
        setCurrentChatId(null);
      }
    }
  }, [currentChatId]);

  const sendChatMessage = useCallback((chatId: string, content: string) => {
    if (socketRef.current && currentUser) {
      socketRef.current.emit('chat:sendMessage', {
        chatId,
        data: { text: content, senderName: currentUser.displayName }
      });
      const newMessage: ChatMessage = {
        id: generateUUID(),
        chatId,
        senderId: currentUser.userId,
        senderName: currentUser.displayName,
        content,
        timestamp: new Date(),
      };
      setChatMessages((prev) => {
        const next = new Map(prev);
        const messages = next.get(chatId) || [];
        next.set(chatId, [...messages, newMessage]);
        return next;
      });
    }
  }, [currentUser]);

  const sendDirectMessage = useCallback((toUserId: string, content: string) => {
    if (socketRef.current && currentUser) {
      socketRef.current.emit('dm:send', {
        toUserId,
        data: { text: content, senderName: currentUser.displayName }
      });
      const newDM: DirectMessage = {
        id: generateUUID(),
        fromUserId: currentUser.userId,
        fromUserName: currentUser.displayName,
        toUserId,
        content,
        timestamp: new Date(),
      };
      setDirectMessages((prev) => {
        const next = new Map(prev);
        const messages = next.get(toUserId) || [];
        next.set(toUserId, [...messages, newDM]);
        return next;
      });
    }
  }, [currentUser]);

  const setSection = useCallback((section: string) => {
    if (socketRef.current) {
      socketRef.current.emit('presence:setSection', { section });
    }
  }, []);

  const subscribeToPresence = useCallback((userIds: string[]) => {
    if (socketRef.current) {
      socketRef.current.emit('presence:subscribe', { userIds });
    }
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Obtener usuarios de un chat via API (para inicializar el conteo)
  const fetchChatUsers = useCallback(async (chatId: string) => {
    try {
      const response = await api.getChatUsers(chatId);
      setChatUserCounts((prev) => {
        const next = new Map(prev);
        next.set(chatId, response.count);
        return next;
      });
      // El servidor retorna un array de strings (userIds), convertimos a objetos ChatUser
      const usersAsObjects: ChatUser[] = (response.users as unknown as (string | ChatUser)[]).map((u) => {
        if (typeof u === 'string') {
          // Es un userId string, convertir a objeto
          return {
            odUserId: u,
            displayName: userRegistry.get(u) || u,
            joinedAt: new Date().toISOString(),
          };
        }
        // Ya es un objeto ChatUser
        return u;
      });
      setChatUsers((prev) => {
        const next = new Map(prev);
        next.set(chatId, usersAsObjects);
        return next;
      });
    } catch (error) {
      console.error('Error fetching chat users:', error);
    }
  }, [userRegistry]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        isConnected,
        currentUser,
        onlineUsers,
        userRegistry,
        chatMessages,
        directMessages,
        notifications,
        currentChatId,
        chatUserCounts,
        chatUsers,
        getDisplayName,
        connect,
        disconnect,
        joinChat,
        leaveChat,
        sendChatMessage,
        sendDirectMessage,
        setSection,
        subscribeToPresence,
        clearNotifications,
        fetchChatUsers,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocketContext() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocketContext must be used within a SocketProvider');
  }
  return context;
}
