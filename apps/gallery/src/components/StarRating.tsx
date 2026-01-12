interface StarRatingProps {
  rating: number;
  onChange?: (rating: number) => void;
  readonly?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export function StarRating({
  rating,
  onChange,
  readonly = false,
  size = 'medium',
}: StarRatingProps) {
  const stars = [1, 2, 3, 4, 5];

  function handleClick(value: number) {
    if (!readonly && onChange) {
      onChange(value);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, value: number) {
    if (!readonly && onChange && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onChange(value);
    }
  }

  return (
    <div className={`star-rating star-rating--${size} ${readonly ? 'readonly' : 'interactive'}`}>
      {stars.map((value) => {
        const isFilled = value <= rating;
        const isPartial = !isFilled && value - 1 < rating && rating < value;
        const fillPercent = isPartial ? (rating - (value - 1)) * 100 : 0;

        return (
          <span
            key={value}
            className={`star ${isFilled ? 'filled' : ''} ${isPartial ? 'partial' : ''}`}
            onClick={() => handleClick(value)}
            onKeyDown={(e) => handleKeyDown(e, value)}
            tabIndex={readonly ? -1 : 0}
            role={readonly ? 'img' : 'button'}
            aria-label={`${value} star${value !== 1 ? 's' : ''}`}
            style={isPartial ? { '--fill-percent': `${fillPercent}%` } as React.CSSProperties : undefined}
          >
            {isFilled || isPartial ? '★' : '☆'}
          </span>
        );
      })}
    </div>
  );
}
