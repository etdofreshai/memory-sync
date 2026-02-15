import { useEffect, useState } from 'react';
import './Messages.css';

interface Message {
  id: number;
  content: string;
  sender: string;
  recipient: string;
  timestamp: string;
  source: string;
  metadata: any;
}

export default function Messages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [sender, setSender] = useState('');
  const [recipient, setRecipient] = useState('');
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    fetchMessages();
  }, [search, source, sender, recipient, offset]);

  async function fetchMessages() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (source) params.set('source', source);
      if (sender) params.set('sender', sender);
      if (recipient) params.set('recipient', recipient);
      params.set('limit', String(limit));
      params.set('offset', String(offset));

      const res = await fetch(`/api/messages?${params}`);
      if (!res.ok) throw new Error(`Error: ${res.status}`);
      const data = await res.json();
      setMessages(data);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    fetchMessages();
  }

  function handlePrev() {
    if (offset > 0) setOffset(offset - limit);
  }

  function handleNext() {
    setOffset(offset + limit);
  }

  return (
    <div className="messages">
      <h1>Messages</h1>

      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          placeholder="Search messages..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          type="text"
          placeholder="Filter by source..."
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        <input
          type="text"
          placeholder="Filter by sender..."
          value={sender}
          onChange={(e) => setSender(e.target.value)}
        />
        <input
          type="text"
          placeholder="Filter by recipient..."
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
        />
        <button type="submit">Search</button>
      </form>

      {loading && <div className="loading">Loading...</div>}

      <div className="messages-list">
        {messages.map((msg) => (
          <div key={msg.id} className="message-card">
            <div className="message-header">
              <span className="message-source">{msg.source}</span>
              <span className="message-timestamp">
                {new Date(msg.timestamp).toLocaleString()}
              </span>
            </div>
            <div className="message-participants">
              <span className="sender">{msg.sender}</span>
              <span className="arrow">→</span>
              <span className="recipient">{msg.recipient}</span>
            </div>
            <div className="message-content">{msg.content}</div>
          </div>
        ))}
      </div>

      {messages.length === 0 && !loading && (
        <div className="no-results">No messages found</div>
      )}

      <div className="pagination">
        <button onClick={handlePrev} disabled={offset === 0}>
          ← Previous
        </button>
        <span className="pagination-info">
          Showing {offset + 1}-{offset + messages.length}
        </span>
        <button onClick={handleNext} disabled={messages.length < limit}>
          Next →
        </button>
      </div>
    </div>
  );
}
