import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { applyAppearance, loadPrefs, watchSystemContrast } from './lib/uiPrefs';

// Before the first render so a dark-theme user never sees a white flash.
applyAppearance(loadPrefs());
watchSystemContrast();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
