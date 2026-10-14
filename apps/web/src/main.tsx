import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { UiProvider } from './ui';
import './i18n';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('root missing');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <UiProvider>
        <App />
      </UiProvider>
    </BrowserRouter>
  </StrictMode>,
);
