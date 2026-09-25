import "./discord-loading-screen.css";

export function DiscordLoadingScreen() {
  return (
    <main
      className="discord-auth-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Se încarcă panoul de moderare"
    >
      <section className="discord-auth-loading__card">
        <div className="discord-auth-loading__shield" aria-hidden="true">
          <span className="discord-auth-loading__glow" />
          <span className="discord-auth-loading__ring" />
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 2L4 5V11C4 16.5 7.5 21 12 22C16.5 21 20 16.5 20 11V5L12 2Z"
              stroke="url(#discord-auth-loading-gradient)"
              strokeWidth="1.6"
              strokeLinejoin="round"
              fill="rgba(217,80,95,0.14)"
            />
            <path
              d="M9 12L11 14L15.5 9.5"
              stroke="#ffffff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <defs>
              <linearGradient id="discord-auth-loading-gradient" x1="4" y1="2" x2="20" y2="22">
                <stop offset="0" stopColor="#d9505f" />
                <stop offset="1" stopColor="#7a2530" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <p className="discord-auth-loading__eyebrow">Oracolul Cenușii</p>
        <h1 className="discord-auth-loading__title">Se încarcă panoul</h1>
        <div className="discord-auth-loading__bar" aria-hidden="true">
          <span />
        </div>
        <p className="discord-auth-loading__label">
          Se pregătește consola de moderare
          <span className="discord-auth-loading__dots" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </p>
      </section>
    </main>
  );
}