// Chhote shared UI pieces
export const RiskBadge = ({ level }) => <span className={`badge b-${level}`}>{level}</span>;
export const StatusBadge = ({ status }) => <span className={`badge s-${status}`}>{String(status).replace(/_/g, ' ')}</span>;
export const SimBanner = () => (
  <div className="sim-banner" role="note">
    ⚠ SIMULATED DEMO — all complaints, assets and records are synthetic for a fictional municipality. Not real government data.
  </div>
);
export const ErrorBox = ({ msg }) => (msg ? <div className="err" role="alert">{msg}</div> : null);
