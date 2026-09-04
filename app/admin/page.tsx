import { clienteServidor } from '@/lib/supabase';
import FormularioResultado from '@/components/FormularioResultado';
import CargarPronosticoIA from '@/components/CargarPronosticoIA';
import VincularCuentas, { type Perfil, type Participante } from '@/components/VincularCuentas';
import type { Resultado } from '@/lib/puntaje';

export const dynamic = 'force-dynamic';

export default async function Admin({
  searchParams,
}: { searchParams: Promise<{ panel?: string }> }) {
  const { panel } = await searchParams;
  const enIA = panel === 'ia';
  const enCuentas = panel === 'cuentas';

  const supabase = await clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <h1 className="titulo">Admin</h1>
        <p className="subtitulo">Entra con una cuenta con permisos.</p>
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

  const [{ data: gps }, { data: equipos }, { data: pilotos }, { data: compuestos }, { data: participantes }, { data: perfiles }, { data: resultados }] =
    await Promise.all([
      supabase.from('gps').select('id, ronda, nombre, tipo').order('ronda'),
      supabase.from('equipos').select('nombre').eq('activo', true).order('nombre'),
      supabase.from('pilotos').select('nombre').eq('activo', true).order('nombre'),
      supabase.from('compuestos').select('codigo, nombre'),
      supabase.from('participantes').select('nombre, tipo, perfil_id').order('nombre'),
      supabase.from('perfiles').select('id, nombre, avatar_url, es_admin, creado_at').order('creado_at'),
      supabase.from('resultados').select('gp_id, sesion, payload'),
    ]);

  const listaEquipos = (equipos ?? []).map((e) => e.nombre as string);
  const listaPilotos = (pilotos ?? []).map((p) => p.nombre as string);
  const listaParticipantes = (participantes ?? []) as Participante[];
  const sinVincular = (perfiles ?? []).filter(
    (pe) => !listaParticipantes.some((pa) => pa.perfil_id === pe.id)
  ).length;

  const titulo = enCuentas ? <>Cuentas<br />de Discord</>
    : enIA ? <>Pronósticos<br />de las IAs</>
    : <>Cargar<br />resultado</>;

  return (
    <>
      <p className="rotulo">Panel de admin</p>
      <h1 className="titulo">{titulo}</h1>

      <nav className="nav" style={{ marginBottom: 22 }}>
        <a href="/admin" aria-current={!enIA && !enCuentas ? 'page' : undefined}>Resultado oficial</a>
        <a href="/admin?panel=ia" aria-current={enIA ? 'page' : undefined}>Pronósticos de IA</a>
        <a href="/admin?panel=cuentas" aria-current={enCuentas ? 'page' : undefined}>
          Cuentas{sinVincular > 0 && ` (${sinVincular})`}
        </a>
      </nav>

      {enCuentas ? (
        <>
          <p className="subtitulo">
            Cada persona entra una vez con Discord y su cuenta aparece aquí sola. Hasta que la
            asocies con su nombre en la porra puede iniciar sesión, pero no enviar pronósticos.
          </p>
          <VincularCuentas
            perfiles={(perfiles ?? []) as Perfil[]}
            participantes={listaParticipantes}
          />
        </>
      ) : enIA ? (
        <>
          <p className="subtitulo">
            Las IAs no tienen cuenta, así que sus pronósticos los cargas tú. Copia la plantilla,
            pídesela a cada una y pega lo que devuelvan. Réplica no pronostica: copia el
            resultado de la ronda anterior con un botón.
          </p>
          <CargarPronosticoIA
            gps={gps ?? []}
            ias={listaParticipantes.filter((p) => p.tipo === 'ia').map((p) => p.nombre)}
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
            La clasificación y la carrera se cargan por separado, cuando toque cada una. Al
            guardar se recalculan los puntajes de la ronda; las medallas y los puntos F1 esperan
            a que esté la carrera, porque hasta entonces el orden sería provisional. Se puede
            corregir y volver a publicar las veces que haga falta.
          </p>
          <FormularioResultado
            gps={gps ?? []}
            equipos={listaEquipos}
            pilotos={listaPilotos}
            compuestos={compuestos ?? []}
            resultados={(resultados ?? []) as { gp_id: number; sesion: string; payload: Partial<Resultado> }[]}
          />
        </>
      )}
    </>
  );
}
