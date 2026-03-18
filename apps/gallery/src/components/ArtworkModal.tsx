import { useState } from 'react';
import type { SavedArtwork } from '@art/types';

interface ArtworkModalProps {
  artwork: SavedArtwork;
  onClose: () => void;
  onVote: (artworkId: string) => Promise<void>;
  voterName: string;
  hasVoted: boolean;
}

export function ArtworkModal({
  artwork,
  onClose,
  onVote,
  voterName,
  hasVoted,
}: ArtworkModalProps) {
  const [voting, setVoting] = useState(false);

  const {
    imagePath,
    review,
    contributingActors,
    voteCount,
    context,
    createdAt,
    cycleNumber,
  } = artwork;

  async function handleVote() {
    if (!voterName) return;

    setVoting(true);
    try {
      await onVote(artwork.id);
    } finally {
      setVoting(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  const formattedDate = new Date(createdAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-content artwork-modal">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          &times;
        </button>

        <div className="modal-body">
          <div className="artwork-full-image">
            <img src={imagePath} alt="Artwork" />
          </div>

          <div className="artwork-details">
            <section className="detail-section">
              <h3>Likes</h3>
              <div className="likes-summary">
                <span className="likes-count">
                  &#9829; {voteCount} {voteCount === 1 ? 'like' : 'likes'}
                </span>
              </div>

              {!hasVoted && voterName && (
                <div className="vote-section">
                  <button
                    className="like-button"
                    onClick={handleVote}
                    disabled={voting}
                  >
                    {voting ? 'Liking...' : '\u2764 Like this artwork'}
                  </button>
                </div>
              )}

              {hasVoted && (
                <p className="already-voted">You have already liked this artwork.</p>
              )}

              {!voterName && (
                <p className="no-name">Set your name in the header to like artworks.</p>
              )}
            </section>

            <section className="detail-section">
              <h3>AI Review</h3>
              <div className="review-scores">
                <div className="review-score">
                  <span className="label">Color Harmony</span>
                  <span className="value">{review.colorHarmony ?? '—'}</span>
                </div>
                <div className="review-score">
                  <span className="label">Composition</span>
                  <span className="value">{review.composition ?? '—'}</span>
                </div>
                <div className="review-score">
                  <span className="label">Visual Unity</span>
                  <span className="value">{review.visualUnity ?? '—'}</span>
                </div>
                <div className="review-score">
                  <span className="label">Depth</span>
                  <span className="value">{review.depthAndLayering ?? '—'}</span>
                </div>
                <div className="review-score">
                  <span className="label">Flow</span>
                  <span className="value">{review.rhythmAndFlow ?? '—'}</span>
                </div>
                <div className="review-score">
                  <span className="label">Complexity</span>
                  <span className="value">{review.intentionalComplexity ?? '—'}</span>
                </div>
                <div className="review-score overall">
                  <span className="label">Overall</span>
                  <span className="value">{review.overallScore}</span>
                </div>
              </div>
              <p className="review-feedback">{review.feedback}</p>
              {review.suggestedTags && review.suggestedTags.length > 0 && (
                <div className="review-tags">
                  {review.suggestedTags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section className="detail-section">
              <h3>Contributing Actors</h3>
              <div className="actors-list">
                {contributingActors.map((actor) => (
                  <div key={actor.actorId} className="actor-item">
                    <div className="actor-info">
                      <span className="actor-name">{actor.actorName}</span>
                      <span className="actor-author">
                        by {actor.authorName}
                        {actor.authorGithub && (
                          <a
                            href={`https://github.com/${actor.authorGithub}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="github-link"
                          >
                            @{actor.authorGithub}
                          </a>
                        )}
                      </span>
                    </div>
                    <div className="actor-contribution">
                      {Math.round(actor.contributionWeight * 100)}%
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="detail-section metadata">
              <h3>Metadata</h3>
              <dl>
                <dt>Created</dt>
                <dd>{formattedDate}</dd>
                <dt>Cycle</dt>
                <dd>#{cycleNumber}</dd>
                <dt>Season</dt>
                <dd>{context.time.season}</dd>
                {context.weather && (
                  <>
                    <dt>Weather</dt>
                    <dd>
                      {context.weather.condition}, {context.weather.temperature}°C
                    </dd>
                  </>
                )}
              </dl>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
