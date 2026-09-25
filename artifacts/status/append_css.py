with open('src/pages/moderation/moderation.css', 'a') as f:
    f.write("""

/* --- BEYOND THIS POINT: THEME OVERRIDES AND ANIMATIONS --- */

.mod-shell::before {
  background:
    radial-gradient(circle at 92% 4%, hsl(356 62% 30% / .15), transparent 35rem),
    radial-gradient(circle at 5% 95%, hsl(4 57% 28% / .1), transparent 30rem),
    linear-gradient(135deg, hsl(var(--background)) 0%, transparent 100%) !important;
}

.mod-shell::after {
  opacity: .025 !important;
  mix-blend-mode: overlay !important;
}

.mod-card {
  border-radius: 16px;
  background: linear-gradient(145deg, hsl(var(--card) / 0.95), hsl(0 18% 4% / 0.95));
  box-shadow: 
    inset 0 1px 0 0 hsl(30 30% 92% / 0.05),
    0 4px 12px hsl(0 0% 0% / 0.2);
  transition: border-color 300ms ease, box-shadow 300ms ease, transform 300ms ease;
}

.mod-card:hover {
  border-color: hsl(var(--border));
  box-shadow: 
    inset 0 1px 0 0 hsl(30 30% 92% / 0.07),
    0 8px 24px hsl(0 0% 0% / 0.3);
}

.mod-card-interactive {
  cursor: pointer;
}

.mod-card-interactive:hover {
  transform: translateY(-2px);
  border-color: hsl(var(--primary) / 0.3);
  box-shadow: 
    inset 0 1px 0 0 hsl(30 30% 92% / 0.1),
    0 12px 32px hsl(0 0% 0% / 0.4),
    0 0 0 1px hsl(var(--primary) / 0.1);
}

.mod-save-bar {
  margin-top: 2rem;
  padding: 1rem 1.25rem;
  border: 1px solid hsl(var(--primary) / 0.3);
  border-radius: 16px;
  background: linear-gradient(145deg, hsl(var(--card) / 0.8), hsl(0 18% 4% / 0.9));
  box-shadow: 
    inset 0 1px 0 0 hsl(30 30% 92% / 0.1),
    0 20px 40px hsl(0 0% 0% / 0.6),
    0 0 40px hsl(var(--primary) / 0.1);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: all 300ms ease;
  animation: slide-up-fade 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.bot-control-save-dot {
  width: 8px;
  height: 8px;
  flex-basis: 8px;
  border-radius: 50%;
  background: hsl(var(--primary));
  box-shadow: 0 0 8px hsl(var(--primary) / 0.6);
}

.bot-control-save-dot.is-saving {
  animation: ember-pulse 1.2s ease-in-out infinite;
}

@keyframes ember-pulse {
  0%, 100% { opacity: 0.5; transform: scale(0.8); box-shadow: 0 0 4px hsl(var(--primary) / 0.4); }
  50% { opacity: 1; transform: scale(1.2); box-shadow: 0 0 12px hsl(var(--primary) / 0.8); }
}

@keyframes slide-up-fade {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-stagger-1 { animation: slide-up-fade 500ms cubic-bezier(0.16, 1, 0.3, 1) 50ms forwards; opacity: 0; }
.animate-stagger-2 { animation: slide-up-fade 500ms cubic-bezier(0.16, 1, 0.3, 1) 100ms forwards; opacity: 0; }
.animate-stagger-3 { animation: slide-up-fade 500ms cubic-bezier(0.16, 1, 0.3, 1) 150ms forwards; opacity: 0; }
.animate-stagger-4 { animation: slide-up-fade 500ms cubic-bezier(0.16, 1, 0.3, 1) 200ms forwards; opacity: 0; }
.animate-stagger-5 { animation: slide-up-fade 500ms cubic-bezier(0.16, 1, 0.3, 1) 250ms forwards; opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .mod-card, .mod-sidebar-item, .mod-sidebar-item::before, .mod-card-interactive, .mod-save-bar,
  .animate-stagger-1, .animate-stagger-2, .animate-stagger-3, .animate-stagger-4, .animate-stagger-5 {
    animation: none !important;
    transition: none !important;
    transform: none !important;
    opacity: 1 !important;
  }
}

.mod-heading {
  text-shadow: 0 2px 10px rgba(0,0,0,0.5);
}

.mod-brand-mark {
  background: linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.02));
  box-shadow: 
    inset 0 1px 0 0 hsl(30 30% 92% / 0.1),
    0 4px 12px hsl(var(--primary) / 0.15) !important;
  border-radius: 12px;
}

.mod-brand-logo {
  border-radius: 11px;
}

.mod-sidebar {
  background: linear-gradient(180deg, hsl(0 18% 6% / 0.98), hsl(0 18% 4% / 0.98));
  box-shadow: 1px 0 0 hsl(var(--border)), 10px 0 30px hsl(0 0% 0% / 0.5);
  backdrop-filter: blur(20px);
}

.mod-status-line::before {
  box-shadow: 0 0 10px currentColor !important;
}

@media (max-width: 767px) {
  .mod-save-bar {
    align-items: stretch;
    flex-direction: column;
    padding: 1rem;
    border-radius: 12px;
  }
  .mod-save-actions {
    margin-top: 1rem;
    width: 100%;
    display: flex;
    justify-content: stretch;
  }
  .mod-save-actions button {
    flex: 1;
  }
}
""")
