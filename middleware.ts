import { createServerClient } from '@supabase/ssr';
import type { CookieAEscribir } from '@/lib/supabase';
import { NextResponse, type NextRequest } from 'next/server';

// Se leen en tiempo de build: Next incrusta las NEXT_PUBLIC_ en el bundle.
// Si el deploy se construyo antes de cargar las variables, aca llegan
// undefined por mucho que esten puestas en el panel.
const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Sin configuracion no hay sesion que refrescar, y se deja pasar la
  // request. El matcher cubre el sitio entero, asi que lanzar aca
  // devuelve un 500 hasta en las paginas estaticas: es preferible que
  // la web cargue sin sesion a que no cargue nada.
  if (!url || !anon) return response;

  const supabase = createServerClient(
    url,
    anon,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (lista: CookieAEscribir[]) => {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          lista.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // Refresca el token en cada request.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)'],
};
