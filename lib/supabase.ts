import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Forma de las cookies que @supabase/ssr pide escribir. */
export type CookieAEscribir = { name: string; value: string; options?: CookieOptions };

/** Cliente para Server Components y Server Actions. */
export async function clienteServidor() {
  const store = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (lista: CookieAEscribir[]) => {
        try {
          lista.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Desde un Server Component las cookies las refresca el middleware.
        }
      },
    },
  });
}

/**
 * Cliente con service role: salta RLS.
 * Sólo en el servidor, y sólo para recalcular puntajes o publicar resultados.
 */
export function clienteAdmin() {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
