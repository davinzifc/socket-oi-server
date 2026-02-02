import { useState } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { ChatRoom } from '../Chat/ChatRoom';
import { DMConversation } from '../DirectMessages/DMConversation';
import { NotificationList } from '../Notifications/NotificationList';
import { AdminPanel } from '../Admin/AdminPanel';
import { ToastContainer } from '../Notifications/ToastContainer';
import type { View } from '../../types';

export function MainLayout() {
  const [currentView, setCurrentView] = useState<View>('chat');

  const renderContent = () => {
    switch (currentView) {
      case 'chat':
        return <ChatRoom />;
      case 'dm':
        return <DMConversation />;
      case 'notifications':
        return <NotificationList />;
      case 'admin':
        return <AdminPanel />;
      default:
        return <ChatRoom />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar currentView={currentView} onViewChange={setCurrentView} />
        <main className="flex-1 overflow-hidden">
          {renderContent()}
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
