'use client';

import { clienteNavegador } from '@/lib/supabase-cliente';

export default function Entrar() {
  const supabase = clienteNavegador();

  const entrarCon = (provider: 'discord' | 'google') =>
    supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

  return (
    <>
      <h1 className="titulo">Entrar</h1>
      <p className="subtitulo">
        Usá la misma cuenta siempre: es la que enlaza tus pronósticos con tu nombre en la tabla.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="boton" onClick={() => entrarCon('discord')}>Entrar con Discord</button>
        <button className="boton secundario" onClick={() => entrarCon('google')}>Entrar con Google</button>
      </div>
    </>
  );
}
