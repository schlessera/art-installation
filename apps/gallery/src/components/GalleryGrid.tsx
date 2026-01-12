import type { SavedArtwork } from '@art/types';
import { ArtworkCard } from './ArtworkCard';

interface GalleryGridProps {
  artworks: SavedArtwork[];
  onArtworkClick: (artwork: SavedArtwork) => void;
  voterName: string;
}

export function GalleryGrid({ artworks, onArtworkClick, voterName }: GalleryGridProps) {
  return (
    <div className="gallery-grid">
      {artworks.map((artwork) => (
        <ArtworkCard
          key={artwork.id}
          artwork={artwork}
          onClick={() => onArtworkClick(artwork)}
          hasVoted={artwork.votes.some(
            (v) => v.voterName.toLowerCase() === voterName.toLowerCase()
          )}
        />
      ))}
    </div>
  );
}
