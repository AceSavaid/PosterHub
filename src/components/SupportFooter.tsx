import { BMC_URL } from '../lib/support';
import { isDesktop } from '../lib/storage';

/** Small footer on the My posters screen with a "Buy me a coffee" link. */
export default function SupportFooter() {
  return (
    <footer className="lib-footer">
      <span>Made by a procrastinating uni student</span>
      <a
        className="bmc-link"
        href={BMC_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Buy me a coffee (opens in a new tab)"
        onClick={(e) => {
          if (!isDesktop()) return;
          e.preventDefault();
          import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(BMC_URL)).catch(() => undefined);
        }}
      >
        <CoffeeCup />
        <span>Buy me a coffee</span>
      </a>
    </footer>
  );
}

function CoffeeCup() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d="M6 3c0 1 1 1.5 1 2.5M10 2c0 1 1 1.5 1 2.5M14 3c0 1 1 1.5 1 2.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M3.5 8h14l-1.6 12.2a2 2 0 0 1-2 1.8H7.1a2 2 0 0 1-2-1.8z" fill="#FFDD00" stroke="#000000" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M17.3 10.5h1.2a2.5 2.5 0 0 1 0 5h-1.8" fill="none" stroke="#000000" strokeWidth="1.2" />
    </svg>
  );
}
