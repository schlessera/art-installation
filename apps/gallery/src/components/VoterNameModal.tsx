import { useState } from 'react';

interface VoterNameModalProps {
  initialName: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

export function VoterNameModal({ initialName, onSubmit, onClose }: VoterNameModalProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter your name');
      return;
    }

    if (trimmedName.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }

    if (trimmedName.length > 50) {
      setError('Name must be less than 50 characters');
      return;
    }

    onSubmit(trimmedName);
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-content name-modal">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          &times;
        </button>

        <h2>Enter Your Name</h2>
        <p>Your name will be shown with your votes.</p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            placeholder="Your name"
            autoFocus
            maxLength={50}
          />

          {error && <p className="error">{error}</p>}

          <div className="button-group">
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
