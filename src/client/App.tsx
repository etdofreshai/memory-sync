import { useState } from 'react';
import Dashboard from './components/Dashboard';
import Messages from './components/Messages';
import Upload from './components/Upload';
import Contacts from './components/Contacts';
import './App.css';

type View = 'dashboard' | 'messages' | 'upload' | 'contacts';

export default function App() {
  const [view, setView] = useState<View>('dashboard');

  return (
    <div className="app">
      <nav className="sidebar">
        <h1>Memory Sync</h1>
        <div className="nav-links">
          <button
            className={view === 'dashboard' ? 'active' : ''}
            onClick={() => setView('dashboard')}
          >
            📊 Dashboard
          </button>
          <button
            className={view === 'messages' ? 'active' : ''}
            onClick={() => setView('messages')}
          >
            💬 Messages
          </button>
          <button
            className={view === 'upload' ? 'active' : ''}
            onClick={() => setView('upload')}
          >
            📤 Upload & Import
          </button>
          <button
            className={view === 'contacts' ? 'active' : ''}
            onClick={() => setView('contacts')}
          >
            👤 Contacts
          </button>
        </div>
      </nav>
      <main className="content">
        {view === 'dashboard' && <Dashboard />}
        {view === 'messages' && <Messages />}
        {view === 'upload' && <Upload />}
        {view === 'contacts' && <Contacts />}
      </main>
    </div>
  );
}
