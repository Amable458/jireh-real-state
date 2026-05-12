import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';
import { initDB } from './db/database.js';

function renderApp() {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
}

function renderFatalError(err) {
  const root = document.getElementById('root');
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,system-ui,sans-serif;background:#f7f8fa;">
      <div style="max-width:480px;background:#fff;border:1px solid #d8dce4;border-radius:14px;padding:28px;box-shadow:0 4px 12px rgba(16,19,28,0.08);">
        <div style="background:#f5c518;display:inline-block;padding:6px 12px;border-radius:8px;font-weight:700;letter-spacing:0.18em;color:#1a1f2c;margin-bottom:14px;">JIREH</div>
        <h1 style="margin:0 0 8px;font-size:20px;color:#1a1f2c;">No se pudo iniciar la aplicación</h1>
        <p style="margin:0 0 12px;font-size:14px;color:#56607a;">${err?.message || 'Error desconocido al abrir la base de datos local.'}</p>
        <ul style="font-size:13px;color:#56607a;padding-left:18px;margin:0 0 16px;">
          <li>Salga del modo privado / incógnito</li>
          <li>Permita "Cookies y datos del sitio" en la configuración</li>
          <li>Pruebe con Chrome, Edge o Firefox</li>
          <li>En Safari: Ajustes → Privacidad → desmarcar "Bloquear todas las cookies"</li>
        </ul>
        <button onclick="location.reload()" style="background:#f5c518;color:#1a1f2c;border:0;padding:9px 16px;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;">Reintentar</button>
      </div>
    </div>
  `;
}

initDB()
  .then(renderApp)
  .catch((err) => {
    console.error('[Jireh] Init error:', err);
    renderFatalError(err);
  });
