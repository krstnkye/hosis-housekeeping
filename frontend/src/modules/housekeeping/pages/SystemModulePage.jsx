export default function SystemModulePage({ module }) {
  return (
    <section className="hk-system-page" aria-labelledby="system-module-title">
      <div className="hk-card hk-system-card">
        <span className="hk-system-card__status">Integration route active</span>
        <h2 id="system-module-title" className="hk-card__title">{module.title}</h2>
        <p className="hk-muted">{module.description}</p>
        <div className="hk-system-card__details">
          <div>
            <strong>Route</strong>
            <code>{module.route}</code>
          </div>
          <div>
            <strong>Subsystem owner</strong>
            <span>{module.owner}</span>
          </div>
          <div>
            <strong>Current status</strong>
            <span>Ready for the class project manager to connect the owning group’s module.</span>
          </div>
        </div>
        <p className="hk-system-card__note">
          This standalone repository contains the complete Housekeeping subsystem only. This page keeps the hotel-wide navigation functional without copying or inventing another group’s implementation.
        </p>
        <div className="hk-actions">
          <a className="hk-btn hk-btn--primary" href="#/housekeeping/overview">Return to Housekeeping</a>
        </div>
      </div>
    </section>
  )
}
