import { clienteServidor } from '@/lib/supabase';
import FormularioResultado from '@/components/FormularioResultado';
import CargarPronosticoIA from '@/components/CargarPronosticoIA';

export const dynamic = 'force-dynamic';

export default async function Admin({
  searchParams,
}: { searchParams: Promise<{ panel?: string }> }) {
  const { panel } = await searchParams;
  const enIA = panel === 'ia';

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

  const [{ data: gps }, { data: equipos }, { data: pilotos }, { data: compuestos }, { data: ias }] =
    await Promise.all([
      supabase.from('gps').select('id, ronda, nombre, tipo').order('ronda'),
      supabase.from('equipos').select('nombre').eq('activo', true).order('nombre'),
      supabase.from('pilotos').select('nombre').eq('activo', true).order('nombre'),
      supabase.from('compuestos').select('codigo, nombre'),
      supabase.from('participantes').select('nombre').eq('tipo', 'ia').order('nombre'),
    ]);

  const listaEquipos = (equipos ?? []).map((e) => e.nombre as string);
  const listaPilotos = (pilotos ?? []).map((p) => p.nombre as string);

  return (
    <>
      <p className="rotulo">Panel de admin</p>
      <h1 className="titulo">{enIA ? <>Pronósticos<br />de las IAs</> : <>Cargar<br />resultado</>}</h1>

      <nav className="nav" style={{ marginBottom: 22 }}>
        <a href="/admin" aria-current={!enIA ? 'page' : undefined}>Resultado oficial</a>
        <a href="/admin?panel=ia" aria-current={enIA ? 'page' : undefined}>Pronósticos de IA</a>
      </nav>

      {enIA ? (
        <>
          <p className="subtitulo">
            Las IAs no tienen cuenta, así que sus pronósticos los cargás vos. Copiá la plantilla,
            pedísela a cada una y pegá lo que devuelvan. Réplica no pronostica: copia el
            resultado de la ronda anterior con un botón.
          </p>
          <CargarPronosticoIA
            gps={gps ?? []}
            ias={(ias ?? []).map((i) => i.nombre as string)}
            catalogos={{
              equipos: listaEquipos,
              pilotos: listaPilotos,
              compuestos: (compuestos ?? []).map((c) => c.codigo as string),
            }}
          />
        </>
      ) : (
        <>
          <p className="subtitulo">
            Al publicar se recalculan todos los pronósticos de la ronda, se reparten las medallas
            y se actualiza la tabla. Se puede corregir y volver a publicar las veces que haga falta.
          </p>
          <FormularioResultado
            gps={gps ?? []}
            equipos={listaEquipos}
            pilotos={listaPilotos}
            compuestos={compuestos ?? []}
          />
        </>
      )}
    </>
  );
}
