import { Evidence, type OfKind, type OperationalArtifactProps } from './shared';

export function Correction({
  artifact,
  onEvidence,
}: Omit<OperationalArtifactProps, 'artifact'> & { artifact: OfKind<'correction'> }) {
  return (
    <>
      <div className="artifact-toolbar">
        <span>Record {artifact.recordId}</span>
        <span
          className={`artifact-status artifact-status-${artifact.state === 'proposed' ? 'pending' : 'corrected'}`}
        >
          {artifact.state === 'proposed' ? 'Proposed · read only' : 'Accepted in source record'}
        </span>
      </div>
      <p className="artifact-correction-field">
        {artifact.field}
        {artifact.unit && <span> · {artifact.unit}</span>}
      </p>
      <div className="artifact-correction-values">
        <div>
          <span>Original record</span>
          <strong>{artifact.original}</strong>
        </div>
        <div>
          <span>{artifact.state === 'proposed' ? 'Proposed value' : 'Recorded correction'}</span>
          <strong>{artifact.proposed}</strong>
        </div>
      </div>
      <div className="artifact-correction-reason">
        <h4>Reason for review</h4>
        <p>{artifact.reason}</p>
      </div>
      <div className="artifact-correction-impact">
        <h4>Potential downstream impact</h4>
        {artifact.impacts.length ? (
          <ul>
            {artifact.impacts.map((impact) => (
              <li key={impact}>{impact}</li>
            ))}
          </ul>
        ) : (
          <p>No downstream impacts were supplied.</p>
        )}
      </div>
      <p className="artifact-note">
        {artifact.state === 'proposed'
          ? 'This proposal has not changed the original record. Review and approval happen in the source workflow.'
          : 'Status is supplied by the source snapshot. This panel does not modify records.'}
      </p>
      <Evidence ids={artifact.sourceIds} onEvidence={onEvidence} />
    </>
  );
}
