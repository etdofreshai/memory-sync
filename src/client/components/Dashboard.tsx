import { useEffect, useState } from 'react';
import './Dashboard.css';

interface Stats {
  sources: Array<{
    source: string;
    count: string;
    earliest: string;
    latest: string;
  }>;
  total: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      setLoading(true);
      const res = await fetch('/api/stats');
      if (!res.ok) throw new Error(`Error: ${res.status}`);
      const data = await res.json();
      setStats(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="loading">Loading stats...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!stats) return <div className="error">No data</div>;

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>

      <div className="stat-card total">
        <h2>Total Messages</h2>
        <div className="stat-value">{parseInt(stats.total).toLocaleString()}</div>
      </div>

      <div className="sources-grid">
        {stats.sources.map((s) => (
          <div key={s.source} className="stat-card">
            <h3>{s.source}</h3>
            <div className="stat-value">{parseInt(s.count).toLocaleString()}</div>
            <div className="stat-meta">
              <div className="stat-date">
                <span>First:</span> {new Date(s.earliest).toLocaleDateString()}
              </div>
              <div className="stat-date">
                <span>Last:</span> {new Date(s.latest).toLocaleDateString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
