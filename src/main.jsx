import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';
import { initDB } from './db/database.js';
import { isConfigured } from './db/supabaseClient.js';

function renderApp() {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
}

function fatalScreen(title, message, extra = '') {
  document.getElementById('root').innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,system-ui,sans-serif;background:#f7f8fa;">
      <div style="max-width:560px;background:#fff;border:1px solid #d8dce4;border-radius:14px;padding:32px;box-shadow:0 4px 12px rgba(16,19,28,0.08);">
        <div style="background:#f5c518;display:inline-block;padding:6px 12px;border-radius:8px;font-weight:700;letter-spacing:0.18em;color:#1a1f2c;margin-bottom:14px;">JIREH</div>
        <h1 style="margin:0 0 8px;font-size:20px;color:#1a1f2c;">${title}</h1>
        <p style="margin:0 0 16px;font-size:14px;color:#56607a;line-height:1.5;">${message}</p>
        ${extra}
        <button onclick="location.reload()" style="background:#f5c518;color:#1a1f2c;border:0;padding:10px 18px;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;margin-top:12px;">Reintentar</button>
      </div>
    </div>
  `;
}

function setupScreen() {
  fatalScreen(
    'Configuración pendiente',
    'La aplicación necesita conectarse a Supabase. El administrador debe configurar las variables de entorno en Vercel:',
    `<div style="background:#f7f8fa;border:1px solid #eef0f4;border-radius:8px;padding:14px;font-family:ui-monospace,monospace;font-size:13px;color:#1a1f2c;">
       VITE_SUPABASE_URL=https://xxxx.supabase.co<br>
       VITE_SUPABASE_ANON_KEY=eyJhbGciOiJI...
     </div>
     <p style="font-size:12px;color:#7e8799;margin:10px 0 0;">Pasos: Vercel Dashboard → Project Settings → Environment Variables → Agregar las dos variables → Redeploy.</p>`
  );
}

function errorScreen(err) {
  fatalScreen(
    'No se pudo iniciar la aplicación',
    err?.message || 'Error desconocido.',
    `<ul style="font-size:13px;color:#56607a;padding-left:18px;margin:0 0 8px;line-height:1.6;">
       <li>Verifica que ejecutaste <b>supabase/schema.sql</b> en el SQL Editor.</li>
       <li>Verifica que también ejecutaste <b>supabase/security.sql</b> (RPCs auth_*).</li>
       <li>Confirma que las variables <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> están bien.</li>
       <li>Revisa la consola del navegador (F12) para más detalles.</li>
     </ul>`
  );
}

if (!isConfigured) {
  setupScreen();
} else {
  initDB()
    .then(renderApp)
    .catch((err) => {
      console.error('[Jireh] Init error:', err);
      errorScreen(err);
    });
}
