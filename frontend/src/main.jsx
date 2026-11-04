import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import AdminPage from './AdminPage';
import { ToastProvider } from './context/ToastContext';
import './styles.css';

/**
 * Tiny path router.
 *
 * /admin (and anything under it) renders the hidden department area; every
 * other path renders the public register. Navigation always stays on the
 * current origin so it works behind any preview or proxy host.
 */
const path = window.location.pathname.replace(/\/+$/, '') || '/';
const isAdmin = path === '/admin' || path.startsWith('/admin/');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>{isAdmin ? <AdminPage /> : <App />}</ToastProvider>
  </StrictMode>
);
