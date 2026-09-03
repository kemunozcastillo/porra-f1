import { clienteServidor } from '@/lib/supabase';
import FormularioResultado from '@/components/FormularioResultado';

export const dynamic = 'force-dynamic';

export default async function Admin() {
  const supabase = await clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <h1 className="titulo">Admin</h1>
        <p className="subtitulo">Entrá con una cuenta con permisos.</p>
        <a className="boton" href="/entrar">Entrar</a>
      </>
    );
  }

  const { data: perfil } = await supabase.from('perfiles').select('es_admin').eq('id', user.id).maybeSingle();
  if (!perfil?.es_admin) {
    return (
      <>
        <h1 className="titulo">Sin acceso</h1>
        <p className="subtitulo">Esta cuenta no tiene permisos de admin.</p>
      </>
    );
  }

  const [{ data: gps }, { data: equipos }, { data: pilotos }, { data: compuestos }] = await Promise.all([
    supabase.from('gps').select('id, ronda, nombre, tipo').order('ronda'),
    supabase.from('equipos').select('nombre').eq('activo', true).order('nombre'),
    supabase.from('pilotos').select('nombre').eq('activo', true).order('nombre'),
    supabase.from('compuestos').select('codigo, nombre'),
  ]);

  return (
    <>
      <p className="rotulo">Panel de resultados</p>
      <h1 className="titulo">Cargar<br />resultado</h1>
      <p className="subtitulo">
        Al publicar se recalculan todos los pronósticos de la ronda, se reparten las medallas
        y se actualiza la tabla. Se puede corregir y volver a publicar las veces que haga falta.
      </p>
      <FormularioResultado
        gps={gps ?? []}
        equipos={(equipos ?? []).map((e) => e.nombre)}
        pilotos={(pilotos ?? []).map((p) => p.nombre)}
        compuestos={compuestos ?? []}
      />
    </>
  );
}
