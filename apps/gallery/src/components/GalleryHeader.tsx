import type { GalleryStats } from '@art/types';

interface GalleryHeaderProps {
  stats: GalleryStats | null;
  sortBy: 'createdAt' | 'combinedScore' | 'voteCount';
  onSortChange: (sort: 'createdAt' | 'combinedScore' | 'voteCount') => void;
  voterName: string;
  onEditName: () => void;
}

export function GalleryHeader({
  stats,
  sortBy,
  onSortChange,
  voterName,
  onEditName,
}: GalleryHeaderProps) {
  return (
    <header className="gallery-header">
      <div className="header-content">
        <div className="header-title">
          <h1>Art Gallery</h1>
          <span className="subtitle">Cloudfest Hackathon 2026</span>
        </div>

        {stats && (
          <div className="stats-bar">
            <div className="stat">
              <span className="stat-value">{stats.visibleCount}</span>
              <span className="stat-label">Artworks</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.totalVotes}</span>
              <span className="stat-label">Votes</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.uniqueVoters}</span>
              <span className="stat-label">Voters</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.averageAIScore?.toFixed(0) || '-'}</span>
              <span className="stat-label">Avg Score</span>
            </div>
          </div>
        )}

        <div className="header-controls">
          <div className="sort-control">
            <label htmlFor="sort-select">Sort by:</label>
            <select
              id="sort-select"
              value={sortBy}
              onChange={(e) =>
                onSortChange(e.target.value as 'createdAt' | 'combinedScore' | 'voteCount')
              }
            >
              <option value="createdAt">Newest</option>
              <option value="combinedScore">Top Rated</option>
              <option value="voteCount">Most Votes</option>
            </select>
          </div>

          <button className="voter-button" onClick={onEditName}>
            {voterName ? (
              <>
                <span className="voter-icon">👤</span>
                <span className="voter-name">{voterName}</span>
              </>
            ) : (
              <>
                <span className="voter-icon">👤</span>
                <span>Set Name to Vote</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
