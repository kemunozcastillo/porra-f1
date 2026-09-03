import { clienteServidor } from '@/lib/supabase';
import FormularioPronostico from '@/components/FormularioPronostico';
import type { TipoComodin } from '@/app/acciones';

export const dynamic = 'force-dynamic';

export default async function Pronostico() {
  const supabase = await clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <h1 className="titulo">Entra para<br />pronosticar</h1>
        <p className="subtitulo">Necesitas iniciar sesión para cargar tu pronóstico.</p>
        <a className="boton" href="/entrar">Entrar</a>
      </>
    );
  }

  const ahora = new Date().toISOString();
  const [{ data: gp }, { data: equipos }, { data: pilotos }, { data: compuestos }, { data: participante }] =
    await Promise.all([
      supabase.from('gps').select('*')
        .gt('carrera_at', ahora).order('ronda').limit(1).maybeSingle()
        .then(async (r) => r.data ? r : await supabase.from('gps').select('*')
          .gt('cierra_at', ahora).order('ronda').limit(1).maybeSingle()),
      supabase.from('equipos').select('nombre').eq('activo', true).order('nombre'),
      supabase.from('pilotos').select('nombre').eq('activo', true).order('nombre'),
      supabase.from('compuestos').select('codigo, nombre'),
      supabase.from('participantes').select('nombre').eq('perfil_id', user.id).maybeSingle(),
    ]);

  if (!gp) {
    return (
      <>
        <h1 className="titulo">Temporada<br />cerrada</h1>
        <p className="subtitulo">No hay ninguna ronda abierta. Nos vemos en la próxima.</p>
      </>
    );
  }

  if (!participante) {
    return (
      <>
        <h1 className="titulo">Falta<br />vincular</h1>
        <p className="subtitulo">
          Tu cuenta existe pero todavía no está enlazada a un participante de la porra.
          Pide a un administrador que ejecute: <code>update participantes set perfil_id = &apos;{user.id}&apos; where nombre = &apos;TU_NOMBRE&apos;;</code>
        </p>
      </>
    );
  }

  const [{ data: previa }, { data: comodines }] = await Promise.all([
    supabase.from('predicciones').select('payload')
      .eq('participante', participante.nombre).eq('gp_id', gp.id).maybeSingle(),
    supabase.from('comodines').select('tipo, gp_id').eq('participante', participante.nombre),
  ]);

  const quemados = new Set((comodines ?? []).map((c) => c.tipo));
  const disponibles = (['boost', 'boost_ciegas'] as TipoComodin[]).filter((c) => !quemados.has(c));
  const declarado = (comodines ?? []).find((c) => c.gp_id === gp.id)?.tipo as TipoComodin | undefined;

  return (
    <>
      <h1 className="titulo">R{gp.ronda}<br />{gp.nombre}</h1>

      {new Date() > new Date(gp.cierra_at) && (
        <div className="aviso">
          El cierre ya pasó. Puedes enviarlo igual, pero lo que ya se corrió no puntúa:
          se cuenta sólo lo que falta del fin de semana.
        </div>
      )}

      {gp.tipo === 'sprint' && (
        <div className="aviso">
          Fin de semana con sprint: este mismo pronóstico se puntúa dos veces. Contra el
          sprint cuentan sólo las parrillas y los podios, y en escala reducida (3 en el
          lugar exacto, 1 a una posición). Contra el Gran Premio cuenta todo, en escala normal.
        </div>
      )}
      <FormularioPronostico
        gpId={gp.id}
        gpNombre={gp.nombre}
        cierra={gp.cierra_at}
        equipos={(equipos ?? []).map((e) => e.nombre)}
        pilotos={(pilotos ?? []).map((p) => p.nombre)}
        compuestos={compuestos ?? []}
        inicial={(previa?.payload as never) ?? undefined}
        disponibles={disponibles}
        declarado={declarado ?? null}
        fp1={gp.fp1_at ?? null}
      />
    </>
  );
}
