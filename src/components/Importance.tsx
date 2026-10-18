const LABELS = ['Not set', 'Low', 'Some', 'Medium', 'High', 'Critical'];

interface Props {
  value: number;
  onChange: (value: number) => void;
  size?: 'sm' | 'md';
}

// Five bars; click a bar to set importance, click the current level again to clear it.
export function Importance({ value, onChange, size = 'sm' }: Props) {
  return (
    <div className={`importance importance-${size}`} role="radiogroup" aria-label="Importance" title={`Importance: ${LABELS[value]}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${LABELS[n]} (${n} of 5)`}
          className={n <= value ? 'on' : ''}
          onClick={(e) => {
            e.stopPropagation();
            onChange(value === n ? 0 : n);
          }}
        />
      ))}
      {size === 'md' && <span className="importance-label">{LABELS[value]}</span>}
    </div>
  );
}
