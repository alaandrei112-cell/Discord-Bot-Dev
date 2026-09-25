import "./game-guide-loading-screen.css";

export function GameGuideLoadingScreen() {
  return (
    <main
      className="game-guide-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Se încarcă ghidul jocului"
    >
      <section className="game-guide-loading__card">
        <div className="game-guide-loading__icon" aria-hidden="true">
          <span className="game-guide-loading__glow" />
          <span className="game-guide-loading__ring" />
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M4 5.5C4 4.67 4.67 4 5.5 4H11V20H5.5C4.67 20 4 19.33 4 18.5V5.5Z"
              stroke="url(#game-guide-loading-gradient)"
              strokeWidth="1.6"
              strokeLinejoin="round"
              fill="rgba(217,80,95,0.14)"
            />
            <path
              d="M20 5.5C20 4.67 19.33 4 18.5 4H13V20H18.5C19.33 20 20 19.33 20 18.5V5.5Z"
              stroke="url(#game-guide-loading-gradient)"
              strokeWidth="1.6"
              strokeLinejoin="round"
              fill="rgba(217,80,95,0.14)"
            />
            <path
              d="M11 4C11 4 12 5 12 7V20"
              stroke="url(#game-guide-loading-gradient)"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
            <defs>
              <linearGradient id="game-guide-loading-gradient" x1="4" y1="4" x2="20" y2="20">
                <stop offset="0" stopColor="#d9505f" />
                <stop offset="1" stopColor="#7a2530" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <h1 className="game-guide-loading__title">Se încarcă ghidul</h1>
        <div className="game-guide-loading__bar" aria-hidden="true">
          <span />
        </div>
        <p className="game-guide-loading__label">
          Se pregătește ghidul jocului
          <span className="game-guide-loading__dots" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </p>
      </section>
    </main>
  );
}