import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  if (!code) return NextResponse.redirect(`${origin}/?error=sin-codigo`);

  const supabase = await clienteServidor();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/?error=login`);

  // Alta automática de perfil la primera vez.
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const nombre =
      user.user_metadata.full_name ??
      user.user_metadata.name ??
      user.email?.split('@')[0] ??
      'Piloto';
    const { error: errorPerfil } = await supabase.from('perfiles').upsert(
      { id: user.id, nombre, avatar_url: user.user_metadata.avatar_url ?? null },
      { onConflict: 'id', ignoreDuplicates: true }
    );
    // Si el alta falla, la sesion existe pero no hay fila en `perfiles`, y
    // la persona queda en un limbo: entra, pero no se la puede vincular.
    // Se avisa en vez de seguir en silencio.
    if (errorPerfil) {
      console.error('No se pudo crear el perfil:', errorPerfil);
      return NextResponse.redirect(`${origin}/?error=perfil`);
    }
  }
  return NextResponse.redirect(`${origin}/pronostico`);
}
