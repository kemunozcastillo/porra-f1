import './globals.css';
import type { Metadata } from 'next';
import { clienteServidor } from '@/lib/supabase';

export const metadata: Metadata = {
  title: 'Porra F1 — Niniers',
  description: 'Sin dinero de por medio. Solo honor.',
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  const supabase = await clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <div className="marco">
          <header className="barra">
            <div className="marca">Porra<span>/</span>F1</div>
            <nav className="nav">
              <a href="/">Clasificación</a>
              <a href="/pronostico">Pronóstico</a>
              <a href="/reglas">Reglas</a>
            </nav>
            <div className="sesion-actual">
              {user
                ? <a href="/pronostico" data-dentro="si">Sesión iniciada</a>
                : <a href="/entrar">Entrar</a>}
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
