import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import './wrapped.css';
import { WrappedPage } from './WrappedPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WrappedPage />
  </StrictMode>,
);
