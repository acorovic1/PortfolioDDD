import { useState } from 'react';

type CommitInputProps = {
  value: string;
  onCommit: (value: string) => void;
  // Returns an error message for values that shouldn't be saved.
  validate?: (value: string) => string | null;
  placeholder?: string;
  'aria-label'?: string;
};

// A text input that edits a local draft and only saves on blur/Enter - for
// fields the server validates or normalizes (saving every keystroke would
// reject half-typed values or rewrite them mid-typing).
export default function CommitInput({ value, onCommit, validate, placeholder, ...rest }: CommitInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const error = draft !== null && validate ? validate(draft) : null;

  const commit = () => {
    // An invalid draft stays (with its message) rather than silently reverting.
    if (draft === null || error) return;
    if (draft !== value) onCommit(draft);
    setDraft(null);
  };

  return (
    <>
      <input
        value={shown}
        placeholder={placeholder}
        aria-label={rest['aria-label']}
        aria-invalid={!!error}
        className={error ? 'invalid' : undefined}
        title={error ?? undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setDraft(null);
        }}
      />
      {error && <small className="input-error">{error}</small>}
    </>
  );
}
