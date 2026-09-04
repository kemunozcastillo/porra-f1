import { clienteAdmin } from './supabase';
import {
  puntuarSesion, clasificarGP, loQueYaSeCorrio,
  type Prediccion, type Resultado, type Sesion, type HorariosGP,
} from './puntaje';

/**
 * Recalcula los puntajes de un GP (sesión de carrera + sprint si existe)
 * y reparte medallas y puntos F1 de esa ronda.
 *
 * Es idempotente: se puede correr las veces que haga falta. Se dispara
 * cada vez que un admin publica o corrige un resultado.
 */
export async function recalcularGP(gpId: number) {
  const db = clienteAdmin();

  const [{ data: resultados }, { data: predicciones }, { data: gp }] = await Promise.all([
    db.from('resultados').select('sesion, payload, publicado').eq('gp_id', gpId),
    db.from('predicciones')
      .select('participante, payload, enviado_at, anulado, hora_confiable')
      .eq('gp_id', gpId),
    db.from('gps')
      .select('sprint_qualy_at, sprint_carrera_at, qualy_at, carrera_at')
      .eq('id', gpId).maybeSingle(),
  ]);

  if (!resultados?.length || !predicciones?.length) return { filas: 0, podio: false };

  const oficiales = new Map<Sesion, Resultado>(
    resultados.filter((r) => r.publicado).map((r) => [r.sesion as Sesion, r.payload as Resultado])
  );

  const filas = [];
  const totalPorParticipante = new Map<string, number>();

  // El mismo pronóstico se puntúa contra cada resultado publicado de la
  // ronda. En un fin de semana con sprint eso son dos puntajes: el del
  // sprint mide sólo parrillas y podios, el del GP mide todo.
  for (const p of predicciones) {
    for (const sesion of ['sprint', 'gp'] as Sesion[]) {
      const oficial = oficiales.get(sesion);
      if (!oficial) continue;

      const porReloj = loQueYaSeCorrio(
        p.enviado_at, (gp ?? {}) as HorariosGP, sesion, p.hora_confiable
      );
      const manual: string[] = (p.anulado as Record<string, string[]>)?.[sesion] ?? [];
      const yaCorrido = {
        qualy:   porReloj.qualy   || manual.includes('qualy'),
        carrera: porReloj.carrera || manual.includes('carrera'),
      };
      const { puntos, desglose } = puntuarSesion(
        p.payload as Prediccion, oficial, sesion, yaCorrido
      );

      filas.push({
        participante: p.participante,
        gp_id: gpId,
        sesion,
        puntos,
        detalle: desglose,
        calculado_at: new Date().toISOString(),
      });

      totalPorParticipante.set(
        p.participante,
        (totalPorParticipante.get(p.participante) ?? 0) + puntos
      );
    }
  }

  if (!filas.length) return { filas: 0, podio: false };

  await db.from('puntajes').upsert(filas, { onConflict: 'participante,gp_id,sesion' });

  // El podio de la ronda sale de ordenar el puntaje del fin de semana
  // entero, así que no se reparte hasta que está cargada la carrera. Con
  // sólo la clasificación el orden sería provisional, y las medallas y
  // los puntos F1 cambiarían de dueño al llegar el domingo.
  const gpOficial = oficiales.get('gp');
  const hayCarrera = !!(
    gpOficial?.carrera_equipos?.some(Boolean) || gpOficial?.carrera_podio?.some(Boolean)
  );

  if (!hayCarrera) {
    // Si quedaban posiciones de un recálculo anterior se borran: la
    // invariante es que existen exactamente cuando existe la carrera.
    await db.from('posiciones_gp').delete().eq('gp_id', gpId);
    return { filas: filas.length, podio: false };
  }

  // Medallas y puntos F1 de la ronda.
  const tabla = clasificarGP(
    [...totalPorParticipante].map(([participante, total_gp]) => ({ participante, total_gp }))
  );

  await db.from('posiciones_gp').upsert(
    tabla.map((f) => ({ ...f, gp_id: gpId })),
    { onConflict: 'participante,gp_id' }
  );

  return { filas: filas.length, podio: true };
}

/** Recalcula toda la temporada. Útil tras cambiar una regla. */
export async function recalcularTemporada() {
  const db = clienteAdmin();
  const { data: gps } = await db.from('gps').select('id').order('ronda');
  let total = 0;
  for (const gp of gps ?? []) {
    const r = await recalcularGP(gp.id);
    total += r.filas;
  }
  return { filas: total };
}
