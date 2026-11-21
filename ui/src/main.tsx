/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * The browser entry. It installs nothing on a server. The React tree starts
 * here, and the encrypted keystore stays in this browser.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('The page is missing its root element.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
