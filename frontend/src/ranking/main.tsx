import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import './ranking.css';
import { RankingPage } from './RankingPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RankingPage />
  </StrictMode>,
);
