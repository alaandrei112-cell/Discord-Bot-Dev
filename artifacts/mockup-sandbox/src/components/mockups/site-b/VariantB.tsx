export function VariantB() {
  return (
    <div style={{ fontFamily: "'Palatino Linotype', 'Book Antiqua', serif", background: "#1a1208", color: "#d4b896", minHeight: "100vh" }}>
      {/* Nav */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, padding: "0.9rem 2rem", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(20,14,6,0.92)", borderBottom: "1px solid #3d2e14", backdropFilter: "blur(8px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
          <span style={{ fontSize: "1.4rem" }}>🔥</span>
          <span style={{ color: "#f0d090", fontSize: "1rem", letterSpacing: "0.1em" }}>Regatul Cenușii</span>
        </div>
        <a href="#" style={{ background: "linear-gradient(135deg, #5865F2, #4a55d4)", color: "#fff", padding: "0.5rem 1.25rem", borderRadius: "6px", textDecoration: "none", fontSize: "0.85rem", fontFamily: "sans-serif", fontWeight: 600, boxShadow: "0 2px 8px rgba(88,101,242,0.3)" }}>
          Alătură-te pe Discord
        </a>
      </nav>

      {/* Hero */}
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", padding: "6rem 2rem 4rem", maxWidth: 1100, margin: "0 auto", gap: "4rem", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 400px" }}>
          <div style={{ display: "inline-block", background: "rgba(180,120,30,0.15)", border: "1px solid rgba(180,120,30,0.3)", borderRadius: "999px", padding: "0.3rem 1rem", marginBottom: "1.5rem", fontSize: "0.75rem", letterSpacing: "0.3em", color: "#c8a050", fontFamily: "sans-serif" }}>
            ⚔ SERVER DISCORD • COMUNITATE RPG
          </div>
          <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4.5rem)", color: "#f0d090", lineHeight: 1.15, marginBottom: "1.25rem" }}>
            Regatul<br />
            <span style={{ color: "#c8a050", textShadow: "0 0 40px rgba(200,160,80,0.3)" }}>Cenușii</span>
          </h1>
          <div style={{ width: 60, height: 2, background: "linear-gradient(to right, #c8a050, transparent)", marginBottom: "1.5rem" }} />
          <p style={{ fontSize: "1.1rem", color: "#8a7058", lineHeight: 1.8, marginBottom: "2rem" }}>
            Un tărâm unde cenușa acoperă umbrele și eroii se nasc din foc.
            Alătură-te <em style={{ color: "#d4b896" }}>Orei Umbrelor</em> și scrie-ți legenda.
          </p>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <a href="#" style={{ background: "linear-gradient(135deg, #5865F2, #4a55d4)", color: "#fff", padding: "0.85rem 2rem", borderRadius: "8px", textDecoration: "none", fontFamily: "sans-serif", fontWeight: 700, fontSize: "1rem", boxShadow: "0 4px 15px rgba(88,101,242,0.3)" }}>
              🎮 Intră pe Server
            </a>
            <a href="#features" style={{ border: "1px solid #3d2e14", color: "#c8a050", padding: "0.85rem 2rem", borderRadius: "8px", textDecoration: "none", fontFamily: "sans-serif", fontSize: "0.95rem" }}>
              Descoperă lumea
            </a>
          </div>
        </div>
        {/* Decorative panel */}
        <div style={{ flex: "1 1 300px", maxWidth: 420 }}>
          <div style={{ background: "linear-gradient(135deg, #1e1508, #14100a)", border: "1px solid #3d2e14", borderRadius: "16px", padding: "2.5rem", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
              <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>🔮</div>
              <h3 style={{ color: "#f0d090", fontSize: "1.1rem", marginBottom: "0.25rem" }}>Oracolul Cenușii</h3>
              <p style={{ color: "#6a5040", fontSize: "0.8rem", fontFamily: "sans-serif" }}>Botul tău de RPG pe Discord</p>
            </div>
            {[
              ["⚔", "Luptă în Ora Umbrelor"],
              ["🪙", "Câștigă oboli & XP"],
              ["🐺", "Recrutează tovarăși"],
              ["📦", "Deschide cufere rare"],
            ].map(([icon, text]) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0", borderBottom: "1px solid #2a1e0a" }}>
                <span style={{ fontSize: "1.1rem" }}>{icon}</span>
                <span style={{ fontSize: "0.875rem", color: "#a08060", fontFamily: "sans-serif" }}>{text}</span>
              </div>
            ))}
            <div style={{ marginTop: "1.5rem", background: "rgba(88,101,242,0.1)", border: "1px solid rgba(88,101,242,0.25)", borderRadius: "8px", padding: "0.75rem", textAlign: "center" }}>
              <span style={{ color: "#7b85e8", fontSize: "0.85rem", fontFamily: "sans-serif" }}>🟢 Server activ acum</span>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div id="features" style={{ padding: "5rem 2rem", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <h2 style={{ fontSize: "2rem", color: "#f0d090", marginBottom: "0.75rem" }}>Lumea Jocului</h2>
          <div style={{ width: 40, height: 2, background: "#c8a050", margin: "0 auto 1rem" }} />
          <p style={{ color: "#6a5040", fontFamily: "sans-serif", fontSize: "0.9rem" }}>Sisteme RPG complexe, direct pe Discord</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.25rem" }}>
          {[
            { icon: "⚔️", title: "Sistem de Luptă", desc: "Luptă contra monștrilor în evenimente speciale. Strategia și abilitățile contează.", color: "#8b2020" },
            { icon: "🪙", title: "Economia Obolilor", desc: "Moneda regatului. Câștigă, cheltuiește, investește în putere.", color: "#c8a050" },
            { icon: "🐺", title: "Tovarăși & Evoluție", desc: "5 tovarăși unici ce evoluează la nivelul 5, fiecare cu puteri distincte.", color: "#4a7a4a" },
            { icon: "⚡", title: "Abilități Speciale", desc: "Împuternicire și Scut — cumpără și îmbunătățește cu oboli + XP.", color: "#7a4ab0" },
            { icon: "📦", title: "Cufere & Comori", desc: "Cufere cu raritate diferită apar aleator. Fii primul care le revendică.", color: "#b07020" },
            { icon: "🏆", title: "Clasament & Glorie", desc: "Luptă pentru a ajunge pe culmile Regatului. Fiecare victorie contează.", color: "#c0392b" },
          ].map(({ icon, title, desc, color }) => (
            <div key={title} style={{ background: "#140e06", border: `1px solid ${color}22`, borderRadius: "12px", padding: "1.5rem", borderTop: `3px solid ${color}` }}>
              <div style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>{icon}</div>
              <h3 style={{ color: "#f0d090", fontSize: "0.95rem", marginBottom: "0.5rem" }}>{title}</h3>
              <p style={{ color: "#5a4030", fontSize: "0.8rem", lineHeight: 1.6, fontFamily: "sans-serif" }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA Banner */}
      <div style={{ margin: "2rem", borderRadius: "16px", background: "linear-gradient(135deg, #1e1508, #2a1a08)", border: "1px solid #3d2e14", padding: "4rem 2rem", textAlign: "center" }}>
        <h2 style={{ fontSize: "2rem", color: "#f0d090", marginBottom: "1rem" }}>Destinul tău te cheamă</h2>
        <p style={{ color: "#6a5040", marginBottom: "2rem", fontFamily: "sans-serif", maxWidth: 400, margin: "0 auto 2rem" }}>
          Sute de jucători te așteaptă în Regatul Cenușii. Alătură-te gratuit.
        </p>
        <a href="#" style={{ background: "linear-gradient(135deg, #5865F2, #4a55d4)", color: "#fff", padding: "1rem 2.5rem", borderRadius: "8px", textDecoration: "none", fontFamily: "sans-serif", fontWeight: 700, fontSize: "1.05rem", display: "inline-block", boxShadow: "0 8px 25px rgba(88,101,242,0.35)" }}>
          🎮 Alătură-te Acum — Gratuit
        </a>
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #2a1e0a", padding: "2rem", textAlign: "center", color: "#3a2810", fontSize: "0.8rem", fontFamily: "sans-serif" }}>
        © 2026 Regatul Cenușii · Oracolul Cenușii#5028
      </div>
    </div>
  );
}
