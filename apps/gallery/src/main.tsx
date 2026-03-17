import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { App } from './App';
import { LandingPage } from './components/LandingPage';
import './styles/index.css';
import './styles/landing.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/gallery" element={<App />} />
        <Route path="/gallery/:artworkId" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
