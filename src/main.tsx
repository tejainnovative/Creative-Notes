import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { ToastProvider } from './ui';
import { db } from './db/schema';
import { router } from './app/routes';
import { registerServiceWorker } from './app/pwa';
import { Unsupported, missingFeatures } from './screens/Unsupported';
import './styles/index.css';

const root = createRoot(document.getElementById('root')!);

async function boot() {
  const missing = missingFeatures();
  if (!missing.length) {
    try {
      await db.open();
    } catch {
      missing.push('Storing notes on this device (blocked, often by a private window)');
    }
  }
  if (missing.length) {
    root.render(<Unsupported missing={missing} />);
    return;
  }
  root.render(
    <StrictMode>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </StrictMode>,
  );
  registerServiceWorker();
}

void boot();
