import type { SavedArtwork } from '@art/types';

interface ArtworkCardProps {
  artwork: SavedArtwork;
  onClick: () => void;
  hasVoted: boolean;
}

export function ArtworkCard({ artwork, onClick, hasVoted }: ArtworkCardProps) {
  const { thumbnailPath, review, voteCount, contributingActors, createdAt } = artwork;

  const formattedDate = new Date(createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Compact actor display: "Actor A, Actor B +3"
  const actorNames = contributingActors.slice(0, 2).map((a) => a.actorName);
  const remaining = contributingActors.length - actorNames.length;
  const actorText = actorNames.join(', ') + (remaining > 0 ? ` +${remaining}` : '');

  return (
    <article className="artwork-card" onClick={onClick}>
      <div className="artwork-image-container">
        <img
          src={thumbnailPath}
          alt={`Artwork by ${contributingActors.map((a) => a.actorName).join(', ')}`}
          className="artwork-image"
          loading="lazy"
        />
        {hasVoted && <div className="voted-badge">Liked</div>}
      </div>

      <div className="artwork-info">
        <div className="card-actors" title={contributingActors.map((a) => a.actorName).join(', ')}>
          {actorText}
        </div>

        <div className="card-score">
          <div className="score-bar-header">
            <span className="score-label">AI Score</span>
            <span className="score-number">{review.overallScore}</span>
          </div>
          <div className="score-bar">
            <div
              className="score-bar-fill"
              style={{ width: `${Math.min(100, review.overallScore)}%` }}
            />
          </div>
        </div>

        <div className="card-meta">
          {voteCount > 0 && <span className="card-likes">&#9829; {voteCount}</span>}
          <time className="card-date">{formattedDate}</time>
        </div>
      </div>
    </article>
  );
}
