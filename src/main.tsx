import { createRoot } from 'react-dom/client';
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import '@fontsource/cairo/800.css';
import '@fontsource/cairo/900.css';
import App from './App.tsx';
import './index.css';
import { initPWAAutoUpdate } from './services/pwaAutoUpdate';

// Start PWA Auto-Update engine (auto-checks for new Vercel deployments and refreshes app)
initPWAAutoUpdate();

createRoot(document.getElementById('root')!).render(<App />);
