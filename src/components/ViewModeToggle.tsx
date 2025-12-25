type ViewModeToggleProps = {
  mode: 'view' | 'edit';
  onToggle: () => void;
};

export default function ViewModeToggle({ mode, onToggle }: ViewModeToggleProps) {
  return (
    <button 
      className={`view-mode-toggle ${mode}`}
      onClick={onToggle}
      title={mode === 'view' ? 'Switch to Edit Mode' : 'Switch to View Mode'}
    >
      {mode === 'view' ? (
        <>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span>View</span>
        </>
      ) : (
        <>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <span>Edit</span>
        </>
      )}
    </button>
  );
}