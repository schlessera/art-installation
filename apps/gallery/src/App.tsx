import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { SavedArtwork, GalleryStats } from '@art/types';
import { GalleryHeader } from './components/GalleryHeader';
import { GalleryGrid } from './components/GalleryGrid';
import { ArtworkModal } from './components/ArtworkModal';
import { VoterNameModal } from './components/VoterNameModal';
import { useGalleryApi } from './hooks/useGalleryApi';
import { useLocalStorage } from './hooks/useLocalStorage';

export function App() {
  const { artworkId } = useParams<{ artworkId?: string }>();
  const navigate = useNavigate();

  const [artworks, setArtworks] = useState<SavedArtwork[]>([]);
  const [stats, setStats] = useState<GalleryStats | null>(null);
  const [selectedArtwork, setSelectedArtwork] = useState<SavedArtwork | null>(null);
  const [showNameModal, setShowNameModal] = useState(false);
  const [voterName, setVoterName] = useLocalStorage<string>('voter-name', '');
  const [sortBy, setSortBy] = useState<'createdAt' | 'combinedScore' | 'voteCount'>('combinedScore');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const api = useGalleryApi();

  // Load artworks on mount and when sort changes
  useEffect(() => {
    loadArtworks();
    loadStats();
  }, [sortBy]);

  // Auto-refresh every 10 seconds (no loading spinner)
  useEffect(() => {
    const interval = setInterval(() => {
      refreshArtworks();
      loadStats();
    }, 10_000);
    return () => clearInterval(interval);
  }, [sortBy]);

  // Open modal from URL param (deep link)
  useEffect(() => {
    if (!artworkId) {
      setSelectedArtwork(null);
      return;
    }

    // Try to find in already-loaded artworks first
    const found = artworks.find((a) => a.id === artworkId);
    if (found) {
      setSelectedArtwork(found);
      return;
    }

    // Otherwise fetch it directly
    api.getArtwork(artworkId).then((artwork) => {
      if (artwork) {
        setSelectedArtwork(artwork);
      } else {
        // Invalid ID — redirect to gallery
        navigate('/gallery', { replace: true });
      }
    });
  }, [artworkId, artworks]);

  async function refreshArtworks() {
    try {
      const data = await api.getArtworks({
        isVisible: true,
        isArchived: false,
        sortBy,
        sortDirection: 'desc',
      });
      setArtworks(data);
      setError(null);
    } catch {
      // Silently ignore background refresh errors
    }
  }

  async function loadArtworks() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getArtworks({
        isVisible: true,
        isArchived: false,
        sortBy,
        sortDirection: 'desc',
      });
      setArtworks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load artworks');
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const data = await api.getStats();
      setStats(data);
      // Set aspect ratio CSS variable for card thumbnails
      if (data.aspectRatio) {
        document.documentElement.style.setProperty('--artwork-aspect-ratio', String(data.aspectRatio));
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  function handleArtworkClick(artwork: SavedArtwork) {
    navigate(`/gallery/${artwork.id}`);
  }

  function handleCloseModal() {
    navigate('/gallery');
  }

  async function handleVote(artworkId: string) {
    if (!voterName) {
      setShowNameModal(true);
      return;
    }

    try {
      await api.vote(artworkId, voterName);
      // Refresh artworks to get updated vote counts
      await loadArtworks();
      await loadStats();
      // Update selected artwork if still viewing
      if (selectedArtwork?.id === artworkId) {
        const updated = await api.getArtwork(artworkId);
        if (updated) setSelectedArtwork(updated);
      }
    } catch (err) {
      console.error('Vote failed:', err);
    }
  }

  function handleNameSubmit(name: string) {
    setVoterName(name);
    setShowNameModal(false);
  }

  return (
    <div className="app">
      <GalleryHeader
        stats={stats}
        sortBy={sortBy}
        onSortChange={setSortBy}
        voterName={voterName}
        onEditName={() => setShowNameModal(true)}
      />

      <main className="main-content">
        {loading && <div className="loading-state">Loading artworks...</div>}

        {error && (
          <div className="error-state">
            <p>{error}</p>
            <button onClick={loadArtworks}>Try Again</button>
          </div>
        )}

        {!loading && !error && artworks.length === 0 && (
          <div className="empty-state">
            <h2>No artworks yet</h2>
            <p>Artworks will appear here as the installation creates them.</p>
          </div>
        )}

        {!loading && !error && artworks.length > 0 && (
          <GalleryGrid
            artworks={artworks}
            onArtworkClick={handleArtworkClick}
            voterName={voterName}
          />
        )}
      </main>

      {selectedArtwork && (
        <ArtworkModal
          artwork={selectedArtwork}
          onClose={handleCloseModal}
          onVote={handleVote}
          voterName={voterName}
          hasVoted={selectedArtwork.votes.some(
            (v) => v.voterName.toLowerCase() === voterName.toLowerCase()
          )}
        />
      )}

      {showNameModal && (
        <VoterNameModal
          initialName={voterName}
          onSubmit={handleNameSubmit}
          onClose={() => setShowNameModal(false)}
        />
      )}
    </div>
  );
}
