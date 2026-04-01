import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import QueryProvider from './providers/QueryProvider';
import { initWebSocket } from './lib/websocket';

// Initialize WebSocket transport (stubbed only when mock mode is explicitly enabled)
initWebSocket();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </StrictMode>,
);
