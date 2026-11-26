import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// Optional cookie-free Cloudflare Web Analytics (activates in production when VITE_CF_WEB_ANALYTICS_TOKEN is set;
// Cloudflare Pages' 1-click Web Analytics edge toggle also works automatically with no env var needed).
const cfToken = (import.meta.env.VITE_CF_WEB_ANALYTICS_TOKEN as string | undefined)?.trim();
if (import.meta.env.PROD && cfToken && /^[a-f0-9]{16,64}$/i.test(cfToken)) {
  const script = document.createElement('script');
  script.defer = true;
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  script.setAttribute('data-cf-beacon', JSON.stringify({ token: cfToken }));
  document.head.appendChild(script);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
