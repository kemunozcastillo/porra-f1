import { clienteServidor } from '@/lib/supabase';
import FormularioResultado from '@/components/FormularioResultado';
import CargarPronosticoIA from '@/components/CargarPronosticoIA';
import VincularCuentas, { type Perfil, type Participante } from '@/components/VincularCuentas';
import type { Resultado } from '@/lib/puntaje';
import QuienFalta from '@/components/QuienFalta';
import RecalcularTemporada from '@/components/RecalcularTemporada';

export const dynamic = 'force-dynamic';

export default async function Admin({
  searchParams,
}: { searchParams: Promise<{ panel?: string }> }) {
  const { panel } = await searchParams;
  const enIA = panel === 'ia';
  const enCuentas = panel === 'cuentas';
  const enFaltan = panel === 'faltan';

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

  const [{ data: gps }, { data: equipos }, { data: pilotos }, { data: compuestos }, { data: participantes }, { data: perfiles }, { data: resultados }, { data: enviados }] =
    await Promise.all([
      supabase.from('gps').select('id, ronda, nombre, tipo, estado, cierra_at').order('ronda'),
      supabase.from('equipos').select('nombre').eq('activo', true).order('nombre'),
      supabase.from('pilotos').select('nombre').eq('activo', true).order('nombre'),
      supabase.from('compuestos').select('codigo, nombre'),
      supabase.from('participantes').select('nombre, tipo, perfil_id').order('nombre'),
      supabase.from('perfiles').select('id, nombre, avatar_url, es_admin, creado_at').order('creado_at'),
      supabase.from('resultados').select('gp_id, sesion, payload'),
      supabase.from('predicciones').select('gp_id, participante, enviado_at'),
    ]);

  const listaEquipos = (equipos ?? []).map((e) => e.nombre as string);
  const listaPilotos = (pilotos ?? []).map((p) => p.nombre as string);
  const listaParticipantes = (participantes ?? []) as Participante[];
  const sinVincular = (perfiles ?? []).filter(
    (pe) => !listaParticipantes.some((pa) => pa.perfil_id === pe.id)
  ).length;

  // La ronda abierta es la que interesa mirar; si no hay ninguna, la
  // siguiente por correrse, y como ultimo recurso la primera.
  const rondaEnCurso =
    (gps ?? []).find((g) => g.estado === 'abierto')?.id
    ?? (gps ?? []).find((g) => g.estado === 'proximo')?.id
    ?? gps?.[0]?.id ?? 0;

  const humanos = listaParticipantes.filter((p) => p.tipo === 'humano');
  const yaMandaron = new Set(
    (enviados ?? []).filter((e) => e.gp_id === rondaEnCurso).map((e) => e.participante)
  );
  const pendientes = humanos.filter((p) => !yaMandaron.has(p.nombre)).length;

  const titulo = enFaltan ? <>Quién<br />falta</>
    : enCuentas ? <>Cuentas<br />de Discord</>
    : enIA ? <>Pronósticos<br />de las IAs</>
    : <>Cargar<br />resultado</>;

  return (
    <>
      <p className="rotulo">Panel de admin</p>
      <h1 className="titulo">{titulo}</h1>

      <nav className="nav" style={{ marginBottom: 22 }}>
        <a href="/admin" aria-current={!enIA && !enCuentas && !enFaltan ? 'page' : undefined}>Resultado oficial</a>
        <a href="/admin?panel=faltan" aria-current={enFaltan ? 'page' : undefined}>
          Quién falta{pendientes > 0 && ` (${pendientes})`}
        </a>
        <a href="/admin?panel=ia" aria-current={enIA ? 'page' : undefined}>Pronósticos de IA</a>
        <a href="/admin?panel=cuentas" aria-current={enCuentas ? 'page' : undefined}>
          Cuentas{sinVincular > 0 && ` (${sinVincular})`}
        </a>
      </nav>

      {enFaltan ? (
        <>
          <p className="subtitulo">
            Quién ha mandado su pronóstico y quién no.
          </p>
          <QuienFalta
            gps={(gps ?? []) as { id: number; ronda: number; nombre: string; estado: string; cierra_at: string | null }[]}
            participantes={listaParticipantes}
            enviados={(enviados ?? []) as { gp_id: number; participante: string; enviado_at: string | null }[]}
            gpInicial={rondaEnCurso}
          />
        </>
      ) : enCuentas ? (
        <>
          <p className="subtitulo">
            Las cuentas aparecen solas al entrar por primera vez con Discord.
          </p>
          <VincularCuentas
            perfiles={(perfiles ?? []) as Perfil[]}
            participantes={listaParticipantes}
          />
        </>
      ) : enIA ? (
        <>
          <p className="subtitulo">
            Copia la plantilla, pídesela a cada IA y pega lo que devuelva. Réplica tiene su propio botón.
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
            La clasificación y la carrera se cargan por separado. Se puede corregir cuantas veces haga falta.
          </p>
          <FormularioResultado
            gps={gps ?? []}
            equipos={listaEquipos}
            pilotos={listaPilotos}
            compuestos={compuestos ?? []}
            resultados={(resultados ?? []) as { gp_id: number; sesion: string; payload: Partial<Resultado> }[]}
          />
          <RecalcularTemporada />
        </>
      )}
    </>
  );
}
