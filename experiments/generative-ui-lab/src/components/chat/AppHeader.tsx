import { Icon } from '../ui/Icon';

export function AppHeader({
  operator,
  onLibrary,
  onNew,
  onSettings,
}: {
  operator: boolean;
  onLibrary: () => void;
  onNew: () => void;
  onSettings: () => void;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <Icon name="compass" width="23" height="23" />
        </span>
        <span>Fieldwork</span>
      </div>
      <span className="sandbox-badge">
        {operator ? (
          <>
            <span className="wide-preview-label">Operator preview · synthetic data</span>
            <span className="compact-preview-label">Synthetic demo</span>
          </>
        ) : (
          'Synthetic demo'
        )}
      </span>
      <div className="topbar-actions">
        <button className="secondary-button" type="button" onClick={onLibrary}>
          <Icon name="library" />
          {operator ? 'Library' : 'History'}
        </button>
        <button className="quiet-button" type="button" onClick={onNew}>
          {operator && <Icon name="plus" />}
          {operator ? 'New chat' : 'New investigation'}
        </button>
        <button
          className="quiet-button settings-trigger"
          aria-label="Lab settings"
          type="button"
          onClick={onSettings}
        >
          <Icon name="settings" />
          <span>Lab settings</span>
        </button>
      </div>
    </header>
  );
}
