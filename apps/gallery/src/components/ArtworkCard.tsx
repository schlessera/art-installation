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
        <div className="card-scores-row">
          <div className="card-ai-score">
            <span className="score-number">{review.overallScore}</span>
            <span className="score-label">AI Score</span>
          </div>
          {voteCount > 0 && (
            <div className="card-votes">
              <span className="score-number votes-number">&hearts; {voteCount}</span>
              <span className="score-label">Likes</span>
            </div>
          )}
        </div>

        <div className="card-actors">
          {contributingActors.map((actor) => (
            <span key={actor.actorId} className="actor-tag">
              {actor.actorName}
            </span>
          ))}
        </div>

        <time className="card-date">{formattedDate}</time>
      </div>
    </article>
  );
}
