import type { ReactNode } from 'react';
import type { OperationalArtifactProps } from './components/artifacts/shared';
import { Scope } from './components/artifacts/shared';

export type { OperationalArtifactProps } from './components/artifacts/shared';

import './OperationalArtifacts.css';
import { Claims } from './components/artifacts/Claims';
import { Correction } from './components/artifacts/Correction';
import { Matrix } from './components/artifacts/Matrix';
import { Obligations } from './components/artifacts/Obligations';
import { Ranking } from './components/artifacts/Ranking';
import { Series } from './components/artifacts/Series';
import { Timeline } from './components/artifacts/Timeline';

export function OperationalArtifact(props: OperationalArtifactProps) {
  const { artifact } = props;
  let content: ReactNode;
  switch (artifact.kind) {
    case 'series':
      content = <Series {...props} artifact={artifact} />;
      break;
    case 'ranking':
      content = <Ranking {...props} artifact={artifact} />;
      break;
    case 'matrix':
      content = <Matrix {...props} artifact={artifact} />;
      break;
    case 'obligations':
      content = <Obligations {...props} artifact={artifact} />;
      break;
    case 'timeline':
      content = <Timeline {...props} artifact={artifact} />;
      break;
    case 'claims':
      content = <Claims {...props} artifact={artifact} />;
      break;
    case 'correction':
      content = <Correction {...props} artifact={artifact} />;
      break;
    case 'geo':
      return null;
  }
  return (
    <div className={`artifact-content artifact-${artifact.kind}`}>
      <Scope artifact={artifact} />
      {content}
    </div>
  );
}
