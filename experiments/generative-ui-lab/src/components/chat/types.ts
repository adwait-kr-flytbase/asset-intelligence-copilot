import type { ReactNode, RefObject } from 'react';
import type { History, Thread } from '../../history';
import type { Query, Snapshot } from '../../protocol';
import type { SavedView } from '../../view-contract';

export type Run = (text: string, representation?: 'auto' | 'table', query?: Query) => Promise<void>;
export interface ChatProps {
  operator?: boolean;
  savedViews?: SavedView[];
  savedError?: string;
  onOpenSaved?: (definition: SavedView) => void;
  onSaveView?: (snapshot: Snapshot) => void;
  workspace?: ReactNode;
  history: History;
  thread: Thread;
  preview: Snapshot | null;
  busy: boolean;
  progress: string;
  storageState: string;
  mode: 'replay' | 'live';
  renderer: 'a2ui' | 'direct';
  composer: ReactNode;
  logRef: RefObject<HTMLDivElement | null>;
  atBottom: RefObject<boolean>;
  run: Run;
  onThread: (id?: string) => void;
  onContext: (runId: string, area: string, selected: string) => void;
  onEvidence: (runId: string, sourceId: string) => void;
  onError: (message: string) => void;
}
