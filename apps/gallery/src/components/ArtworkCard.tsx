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
        <div className="artwork-scores">
          <div className="score ai-score" title="AI Score">
            <span className="score-icon">🤖</span>
            <span className="score-value">{review.overallScore}</span>
          </div>
          {voteCount > 0 && (
            <div className="score user-score" title="Likes">
              <span className="score-icon">❤️</span>
              <span className="score-value">{voteCount}</span>
            </div>
          )}
        </div>

        <div className="artwork-actors">
          {contributingActors.slice(0, 3).map((actor) => (
            <span key={actor.actorId} className="actor-tag">
              {actor.actorName}
            </span>
          ))}
          {contributingActors.length > 3 && (
            <span className="actor-tag more">+{contributingActors.length - 3}</span>
          )}
        </div>

        <time className="artwork-date">{formattedDate}</time>
      </div>
    </article>
  );
}
