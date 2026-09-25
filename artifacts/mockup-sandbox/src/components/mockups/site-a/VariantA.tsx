export function VariantA() {
  return (
    <div style={{ fontFamily: "'Georgia', serif", background: "#08080d", color: "#c9b99a", minHeight: "100vh" }}>
      {/* Nav */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, padding: "1rem 2rem", display: "flex", justifyContent: "space-between", alignItems: "center", background: "linear-gradient(to bottom, rgba(8,8,13,0.95), transparent)", backdropFilter: "blur(4px)" }}>
        <span style={{ fontSize: "1.1rem", color: "#e8d5b0", letterSpacing: "0.15em", textTransform: "uppercase" }}>⚰ Regatul Cenușii</span>
        <a href="#" style={{ background: "#5865F2", color: "#fff", padding: "0.45rem 1.2rem", borderRadius: "6px", textDecoration: "none", fontSize: "0.85rem", fontFamily: "sans-serif", fontWeight: 600 }}>Alătură-te pe Discord</a>
      </nav>

      {/* Hero */}
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "6rem 2rem 4rem", position: "relative", background: "radial-gradient(ellipse at center top, #1a0a0a 0%, #08080d 60%)" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(139,0,0,0.06) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        <p style={{ color: "#8b0000", fontSize: "0.8rem", letterSpacing: "0.4em", textTransform: "uppercase", marginBottom: "1.5rem", fontFamily: "sans-serif" }}>⚔ Server Discord RPG • Comunitate Românească</p>
        <h1 style={{ fontSize: "clamp(2.5rem, 6vw, 5rem)", color: "#e8d5b0", lineHeight: 1.1, marginBottom: "1rem", textShadow: "0 0 60px rgba(139,0,0,0.4)" }}>
          Regatul<br /><span style={{ color: "#c0392b" }}>Cenușii</span>
        </h1>
        <p style={{ fontSize: "1.15rem", color: "#8a7a6a", maxWidth: 520, lineHeight: 1.7, marginBottom: "2.5rem" }}>
          Intră în lumea <em style={{ color: "#c9b99a" }}>Orei Umbrelor</em> — un RPG de supraviețuire pe Discord unde fiecare alegere contează.
        </p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
          <a href="#" style={{ background: "#5865F2", color: "#fff", padding: "0.8rem 2rem", borderRadius: "8px", textDecoration: "none", fontFamily: "sans-serif", fontWeight: 700, fontSize: "1rem" }}>
            🎮 Intră pe Server
          </a>
          <a href="#" style={{ border: "1px solid #3a2a1a", color: "#c9b99a", padding: "0.8rem 2rem", borderRadius: "8px", textDecoration: "none", fontFamily: "sans-serif", fontSize: "1rem" }}>
            Află mai mult
          </a>
        </div>
        <div style={{ marginTop: "5rem", display: "flex", gap: "3rem", flexWrap: "wrap", justifyContent: "center" }}>
          {[["500+", "Jucători"], ["1000+", "Lupte"], ["50+", "Evenimente"]].map(([n, l]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "2rem", color: "#c0392b", fontWeight: "bold" }}>{n}</div>
              <div style={{ fontSize: "0.8rem", color: "#6a5a4a", letterSpacing: "0.1em", fontFamily: "sans-serif" }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div style={{ padding: "5rem 2rem", maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", fontSize: "2rem", color: "#e8d5b0", marginBottom: "0.75rem" }}>Sistemele Jocului</h2>
        <p style={{ textAlign: "center", color: "#6a5a4a", marginBottom: "3.5rem", fontFamily: "sans-serif" }}>Tot ce ai nevoie pentru a supraviețui în Regatul Cenușii</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.5rem" }}>
          {[
            { icon: "⚔", title: "Lupte & Evenimente", desc: "Înfruntă monștri și jucători în Ora Umbrelor. Câștigă oboli și glorie." },
            { icon: "🪙", title: "Economie cu Oboli", desc: "Câștigă moneda regatului prin lupte, cufere și misiuni. Cheltuiește-o înțelept." },
            { icon: "🐺", title: "Tovarăși", desc: "Recrutează și evoluează tovarăși unici care luptă alături de tine." },
            { icon: "⚡", title: "Abilități Speciale", desc: "Deblochează Împuternicire și Scut pentru a întoarce soarta luptei." },
            { icon: "📦", title: "Cufere cu Comori", desc: "Găsește cufere ascunse și câștigă recompense rare." },
            { icon: "🔮", title: "Oracolul Cenușii", desc: "Botul nostru magic gestionează tot — luptele, economia și lumea jocului." },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{ background: "#0e0e16", border: "1px solid #1a1a24", borderRadius: "12px", padding: "1.75rem", transition: "border-color 0.2s" }}>
              <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>{icon}</div>
              <h3 style={{ color: "#e8d5b0", fontSize: "1.05rem", marginBottom: "0.5rem" }}>{title}</h3>
              <p style={{ color: "#5a4a3a", fontSize: "0.875rem", lineHeight: 1.6, fontFamily: "sans-serif" }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ textAlign: "center", padding: "5rem 2rem", background: "linear-gradient(to top, #0e0210, #08080d)" }}>
        <h2 style={{ fontSize: "2.2rem", color: "#e8d5b0", marginBottom: "1rem" }}>Gata să intri în umbră?</h2>
        <p style={{ color: "#6a5a4a", marginBottom: "2rem", fontFamily: "sans-serif" }}>Serverul te așteaptă. Destinul tău în Regatul Cenușii începe acum.</p>
        <a href="#" style={{ background: "#5865F2", color: "#fff", padding: "1rem 2.5rem", borderRadius: "8px", textDecoration: "none", fontFamily: "sans-serif", fontWeight: 700, fontSize: "1.1rem", display: "inline-block" }}>
          🎮 Alătură-te Acum — Gratuit
        </a>
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #1a1a24", padding: "2rem", textAlign: "center", color: "#3a2a1a", fontSize: "0.8rem", fontFamily: "sans-serif" }}>
        © 2026 Regatul Cenușii · Oracolul Cenușii#5028
      </div>
    </div>
  );
}
