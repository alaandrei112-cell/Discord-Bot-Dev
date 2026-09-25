import { type ReactNode } from "react";
import { Link } from "wouter";
import dragonLogo from "@assets/277cc950-a62b-11f1-aca9-6f5a63b2ac37_1788465450616.png";

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    sword: <><path d="m5 19 5.2-5.2" /><path d="m14.8 10.2 4.7-4.7-1-3-3 1-4.7 4.7" /><path d="m7.5 16.5-2.9-.1.1-2.9" /><path d="m10.1 13.9 2 2" /></>,
    anvil: <><path d="M4 19h16" /><path d="M6 16h12" /><path d="m8 12 2-7h4l2 7" /><path d="M5 12h14" /><path d="M10 5 8 3h8l-2 2" /></>,
    chest: <><path d="M4 8h16v11H4z" /><path d="M4 8 6 4h12l2 4" /><path d="M4 13h16" /><path d="M11 13h2v3h-2z" /></>,
    eye: <><path d="M2.5 12s3.3-5 9.5-5 9.5 5 9.5 5-3.3 5-9.5 5-9.5-5-9.5-5Z" /><circle cx="12" cy="12" r="2.2" /></>,
    arrow: <><path d="M5 12h13" /><path d="m13 7 5 5-5 5" /></>,
    compass: <><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z" /></>,
    crown: <><path d="m4 8 3 3 5-6 5 6 3-3-2 9H6L4 8Z" /><path d="M6 20h12" /></>,
    flame: <><path d="M12 21c4 0 6.5-2.6 6.5-6.2 0-3-2.2-5.1-4.2-7.8-.2 2.2-1.3 3.3-2.3 4.1.2-3.6-1.2-5.8-2.5-7.1C9.6 7.7 5.5 10 5.5 14.7 5.5 18.5 8.1 21 12 21Z" /></>,
    mark: <><path d="m12 3 2.4 6.1L21 12l-6.6 2.5L12 21l-2.4-6.5L3 12l6.6-2.9L12 3Z" /></>,
    book: <><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>,
    potion: <><path d="M9 2v2" /><path d="M15 2v2" /><path d="M12 2v2" /><path d="M8 8a6 6 0 1 0 8 0V4H8z" /><path d="M8 11h8" /></>,
    star: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></>,
    key: <><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" /><path d="m21 2-9.6 9.6" /><circle cx="7.5" cy="15.5" r="5.5" /></>,
    menu: <><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></>,
    x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.mark}</svg>;
}

export function StatusDot({ active = false }: { active?: boolean }) {
  return <span className={`status-dot ${active ? "status-dot--active" : ""}`} aria-hidden="true" />;
}

export function DragonLogo({ className = "" }: { className?: string }) {
  return <div className={`dragon-logo ${className}`} aria-hidden="true"><img src={dragonLogo} alt="" /></div>;
}

export function AshCore({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`ash-core ${compact ? "ash-core--compact" : ""}`} aria-hidden="true">
      <span className="core-ring core-ring--one" />
      <span className="core-ring core-ring--two" />
      <span className="core-ring core-ring--three" />
      <span className="core-spark core-spark--one" />
      <span className="core-spark core-spark--two" />
      <span className="core-spark core-spark--three" />
      <span className="core-flare" />
    </div>
  );
}

export function Brand({ footer = false }: { footer?: boolean }) {
  const content = (
    <>
      <span className="brand-mark">
        <img src={dragonLogo} alt="" />
      </span>
       <span data-aos="flip-left">
        <strong>REGATUL</strong>
        <small>CENUȘII</small>
      </span>
    </>
  );

  return (
    <Link href="/" className={`brand ${footer ? "brand--footer" : ""}`} aria-label="Regatul Cenușii, acasă" data-testid={footer ? "link-footer-brand" : "link-brand"}>
      {content}
    </Link>
  );
}
