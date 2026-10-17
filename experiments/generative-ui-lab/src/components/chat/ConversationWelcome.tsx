import { Icon, type IconName } from '../ui/Icon';
import { operatorViews, starters } from './suggestions';
import type { Run } from './types';

const operatorStarters = [
  {
    query: 'attention' as const,
    text: 'Show an inspection overview for LAB-W01',
    title: 'Inspection overview',
    description: 'LAB-W01 · latest readings, status and evidence',
    icon: 'inspect' as IconName,
  },
  {
    query: 'downtime' as const,
    text: 'Where are we losing production time?',
    title: 'Production time',
    description: 'Compare wells and follow the inspection history',
    icon: 'trend' as IconName,
  },
  {
    query: 'spills' as const,
    text: 'Show spills and conflicting records',
    title: 'Spills and conflicting records',
    description: 'See recorded events in their geographic context',
    icon: 'map' as IconName,
  },
];
export function ConversationWelcome({
  operator,
  busy,
  run,
}: {
  operator: boolean;
  busy: boolean;
  run: Run;
}) {
  return (
    <div className="continuous-welcome">
      {!operator && <span>FIELDWORK ASSISTANT</span>}
      <h2>{operator ? 'Start with a well. Follow the evidence.' : 'What do you need to know?'}</h2>
      <p>
        {operator
          ? 'Ask about your operation. Explore the map, compare readings or follow an issue back to its source. Save the views you want to use again.'
          : 'Ask a question. Explore the answer and its data right here in the conversation.'}
      </p>
      <div className="continuous-starters">
        {operator
          ? operatorStarters.map((item) => (
              <button
                type="button"
                key={item.query}
                aria-label={item.text}
                disabled={busy}
                onClick={() => void run(item.text, 'auto', item.query)}
              >
                <span className="starter-symbol">
                  <Icon name={item.icon} width="22" height="22" />
                </span>
                <span className="starter-copy">
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
                <Icon name="arrow-right" />
              </button>
            ))
          : starters.map((item) => (
              <button
                type="button"
                key={item.query}
                disabled={busy}
                onClick={() => void run(item.text, 'auto', item.query)}
              >
                {item.text}
              </button>
            ))}
      </div>
      {operator && (
        <details className="operator-explore">
          <summary>Explore maps, costs and operational evidence</summary>
          <div>
            {operatorViews.map((view) => (
              <button
                type="button"
                key={view.label}
                disabled={busy}
                onClick={() => void run(view.prompt, 'auto', view.query)}
              >
                {view.label}
                <Icon name="arrow-right" />
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
