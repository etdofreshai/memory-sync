import { useEffect, useState } from 'react';
import './Contacts.css';

interface Contact {
  id: number;
  name: string;
  aliases: string[] | null;
  relationships: any;
  metadata: any;
}

export default function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchContacts();
  }, [search]);

  async function fetchContacts() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);

      const res = await fetch(`/api/contacts?${params}`);
      if (!res.ok) throw new Error(`Error: ${res.status}`);
      const data = await res.json();
      setContacts(data);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchContacts();
  }

  return (
    <div className="contacts">
      <h1>Contacts</h1>

      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit">Search</button>
      </form>

      {loading && <div className="loading">Loading...</div>}

      <div className="contacts-grid">
        {contacts.map((contact) => (
          <div key={contact.id} className="contact-card">
            <h3>{contact.name}</h3>
            {contact.aliases && contact.aliases.length > 0 && (
              <div className="contact-aliases">
                <span className="label">Aliases:</span>
                {contact.aliases.map((alias, i) => (
                  <span key={i} className="alias">
                    {alias}
                  </span>
                ))}
              </div>
            )}
            {contact.relationships && Object.keys(contact.relationships).length > 0 && (
              <div className="contact-relationships">
                <span className="label">Relationships:</span>
                <div className="relationships-list">
                  {Object.entries(contact.relationships).map(([key, value]) => (
                    <div key={key} className="relationship">
                      <span className="rel-key">{key}:</span>
                      <span className="rel-value">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {contacts.length === 0 && !loading && (
        <div className="no-results">No contacts found</div>
      )}
    </div>
  );
}
