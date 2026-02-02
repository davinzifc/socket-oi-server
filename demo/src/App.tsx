import { SocketProvider, useSocketContext } from './context/SocketContext';
import { LoginForm } from './components/Login/LoginForm';
import { MainLayout } from './components/Layout/MainLayout';

function AppContent() {
  const { isConnected, currentUser } = useSocketContext();

  if (!isConnected || !currentUser) {
    return <LoginForm />;
  }

  return <MainLayout />;
}

function App() {
  return (
    <SocketProvider>
      <AppContent />
    </SocketProvider>
  );
}

export default App;
