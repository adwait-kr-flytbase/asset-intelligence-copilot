import { Icon } from '../ui/Icon';

interface Props {
  input: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
  busy: boolean;
  disabled: boolean;
  operator: boolean;
  mode: 'live' | 'replay';
  connection: 'offline' | 'connecting' | 'ready';
}
export function MessageComposer({
  input,
  onChange,
  onSend,
  onCancel,
  busy,
  disabled,
  operator,
  mode,
  connection,
}: Props) {
  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <label className="sr-only" htmlFor="question">
        Ask Fieldwork
      </label>
      <textarea
        id="question"
        value={input}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          operator
            ? 'Ask about wells, trends, costs or compliance…'
            : 'Ask about well attention, downtime or spills…'
        }
        rows={2}
        maxLength={5000}
      />
      <div className="composer-footer">
        <span>
          {connection === 'offline'
            ? 'Demo backend unavailable'
            : connection === 'connecting'
              ? 'Connecting…'
              : mode === 'replay'
                ? operator
                  ? 'Synthetic demo · Evidence-backed views'
                  : 'Scripted demo · 3 investigations'
                : 'Live model · synthetic data'}
        </span>
        {busy ? (
          <button
            type="button"
            className="primary-button"
            onClick={(e) => {
              e.preventDefault();
              onCancel();
            }}
          >
            Stop update
          </button>
        ) : (
          <button type="submit" className="primary-button" disabled={disabled}>
            Send <Icon name="arrow-up" />
          </button>
        )}
      </div>
    </form>
  );
}
