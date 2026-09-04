'use server';

import { revalidatePath } from 'next/cache';
import { clienteServidor, clienteAdmin } from '@/lib/supabase';
import { recalcularGP } from '@/lib/recalcular';
import type { Prediccion, Resultado, Sesion } from '@/lib/puntaje';
import { validarPrediccion, type Catalogos } from '@/lib/prediccion-json';

export type TipoComodin = 'boost' | 'boost_ciegas';
type Respuesta = { ok: boolean; mensaje: string };

async function participanteActual() {
  const supabase = await clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, nombre: null };
  const { data } = await supabase
    .from('participantes').select('nombre').eq('perfil_id', user.id).maybeSingle();
  return { supabase, user, nombre: data?.nombre ?? null };
}

/**
 * Guarda el pronóstico. El cierre por fecha lo impone RLS en Postgres:
 * si alguien manipula el formulario, la base rechaza igual.
 */
export async function guardarPronostico(
  gpId: number, payload: Prediccion
): Promise<Respuesta> {
  const { supabase, user, nombre } = await participanteActual();
  if (!user) return { ok: false, mensaje: 'Inicia sesión para pronosticar.' };
  if (!nombre) return { ok: false, mensaje: 'Tu cuenta todavía no está vinculada a un participante.' };

  const { error } = await supabase.from('predicciones').upsert(
    { participante: nombre, gp_id: gpId, payload },
    { onConflict: 'participante,gp_id' }
  );
  if (error) return { ok: false, mensaje: 'No se pudo guardar. Puede que el pronóstico ya esté cerrado.' };

  revalidatePath('/pronostico');
  return { ok: true, mensaje: 'Pronóstico guardado.' };
}

/**
 * Declara un comodín. Tiene su propio plazo, distinto del pronóstico:
 * el boost a ciegas cierra cuando arranca la FP1. Ese control también
 * está en RLS; acá sólo traducimos el rechazo a un mensaje legible.
 */
export async function declararComodin(gpId: number, tipo: TipoComodin): Promise<Respuesta> {
  const { supabase, user, nombre } = await participanteActual();
  if (!user) return { ok: false, mensaje: 'Inicia sesión.' };
  if (!nombre) return { ok: false, mensaje: 'Tu cuenta todavía no está vinculada a un participante.' };

  const { error } = await supabase.from('comodines').insert({ participante: nombre, tipo, gp_id: gpId });

  if (error) {
    // 23505 = clave duplicada: o ya lo usó, o ya tiene otro comodín en esta ronda.
    if (error.code === '23505') {
      return { ok: false, mensaje: 'Ya usaste ese comodín, o ya tienes uno declarado en esta ronda.' };
    }
    return {
      ok: false,
      mensaje: tipo === 'boost_ciegas'
        ? 'El boost a ciegas cierra cuando arranca la FP1. Para esta ronda ya pasó.'
        : 'El plazo para declarar el boost en esta ronda ya cerró.',
    };
  }

  revalidatePath('/pronostico');
  return { ok: true, mensaje: tipo === 'boost_ciegas' ? 'Boost a ciegas declarado.' : 'Boost declarado.' };
}

/** Retira un comodín mientras su plazo siga abierto. */
export async function retirarComodin(gpId: number, tipo: TipoComodin): Promise<Respuesta> {
  const { supabase, nombre } = await participanteActual();
  if (!nombre) return { ok: false, mensaje: 'Inicia sesión.' };

  const { error } = await supabase.from('comodines')
    .delete().eq('participante', nombre).eq('gp_id', gpId).eq('tipo', tipo);
  if (error) return { ok: false, mensaje: 'El plazo ya cerró: el comodín queda quemado.' };

  revalidatePath('/pronostico');
  return { ok: true, mensaje: 'Comodín retirado.' };
}

export type BloqueResultado = 'qualy' | 'carrera';

/**
 * Carga o corrige un bloque del resultado oficial y recalcula la ronda.
 *
 * Se carga por partes porque el fin de semana llega por partes: el
 * sábado se conoce la clasificación y el domingo la carrera. Antes había
 * que volver a teclear la clasificación entera para poder guardar la
 * carrera, y era el doble de trabajo para nada.
 *
 * Lo que llega se fusiona con lo que ya hubiera guardado en esa sesión,
 * así que corregir un bloque no borra el otro.
 */
export async function publicarResultado(
  gpId: number, sesion: Sesion, bloque: BloqueResultado, datos: Partial<Resultado>
): Promise<Respuesta> {
  const no = await soloAdmin();
  if (no) return { ok: false, mensaje: no };

  const db = clienteAdmin();
  const { data: previo } = await db.from('resultados')
    .select('payload').eq('gp_id', gpId).eq('sesion', sesion).maybeSingle();

  const payload = { ...((previo?.payload as Partial<Resultado>) ?? {}), ...datos };

  const { error } = await db.from('resultados').upsert(
    { gp_id: gpId, sesion, payload, publicado: true, cargado_at: new Date().toISOString() },
    { onConflict: 'gp_id,sesion' }
  );
  if (error) return { ok: false, mensaje: `No se pudo guardar: ${error.message}` };

  const { filas, podio } = await recalcularGP(gpId);
  revalidatePath('/');
  revalidatePath('/gp');
  revalidatePath('/admin');

  const que = bloque === 'qualy' ? 'Clasificación' : 'Carrera';
  return {
    ok: true,
    mensaje: podio
      ? `${que} guardada. ${filas} puntajes recalculados y medallas repartidas.`
      : `${que} guardada. ${filas} puntajes recalculados. Las medallas y los puntos F1 esperan a la carrera.`,
  };
}

// ------------------------------------------------------------------
// Carga administrada: pronósticos de las IAs
// ------------------------------------------------------------------

/**
 * Las IAs no tienen cuenta, así que sus pronósticos los carga un admin
 * desde el panel. Eso obliga a usar la clave de servicio: RLS exige que
 * `participante` sea el del usuario autenticado, y aquí nunca lo es.
 *
 * Se guardan con `hora_confiable = false` a propósito. `enviado_at` sería
 * el momento en que el admin pegó el JSON, no aquel en que la IA lo
 * produjo, así que descontarle bloques por «llegar tarde» castigaría la
 * demora del admin y no la de la IA. El plazo real lo controla el admin
 * al decidir cuándo pide los pronósticos.
 */
async function soloAdmin() {
  const supabase = await clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'Inicia sesión.';
  const { data: perfil } = await supabase
    .from('perfiles').select('es_admin').eq('id', user.id).maybeSingle();
  return perfil?.es_admin ? null : 'Necesitas permisos de admin.';
}

async function catalogos(): Promise<Catalogos> {
  const db = clienteAdmin();
  const [{ data: eq }, { data: pi }, { data: co }] = await Promise.all([
    db.from('equipos').select('nombre').eq('activo', true).order('nombre'),
    db.from('pilotos').select('nombre').eq('activo', true).order('nombre'),
    db.from('compuestos').select('codigo'),
  ]);
  return {
    equipos: (eq ?? []).map((e) => e.nombre as string),
    pilotos: (pi ?? []).map((p) => p.nombre as string),
    compuestos: (co ?? []).map((c) => c.codigo as string),
  };
}

export type RespuestaCarga = Respuesta & { errores?: string[]; avisos?: string[] };

/** Carga el pronóstico de una IA a partir del JSON que devolvió. */
export async function cargarPronosticoIA(
  participante: string, gpId: number, textoJson: string
): Promise<RespuestaCarga> {
  const no = await soloAdmin();
  if (no) return { ok: false, mensaje: no };

  let bruto: unknown;
  try {
    bruto = JSON.parse(textoJson);
  } catch (e) {
    return { ok: false, mensaje: 'El texto no es JSON válido.', errores: [String(e)] };
  }

  const v = validarPrediccion(bruto, await catalogos());
  if (!v.ok) {
    return {
      ok: false,
      mensaje: `El pronóstico tiene ${v.errores.length} problema(s). No se guardó nada.`,
      errores: v.errores, avisos: v.avisos,
    };
  }

  const db = clienteAdmin();
  const { error } = await db.from('predicciones').upsert(
    {
      participante, gp_id: gpId,
      payload: v.prediccion,
      hora_confiable: false,
      enviado_at: new Date().toISOString(),
    },
    { onConflict: 'participante,gp_id' }
  );
  if (error) return { ok: false, mensaje: `No se pudo guardar: ${error.message}` };

  // Idempotente: si la ronda ya tiene resultado, deja los puntajes al día.
  await recalcularGP(gpId);
  revalidatePath('/');
  revalidatePath('/admin');
  return {
    ok: true,
    mensaje: `Pronóstico de ${participante} guardado.`,
    avisos: v.avisos,
  };
}

/**
 * Réplica no pronostica: repite el resultado de la ronda anterior.
 * Se toma el último Gran Premio publicado antes de esta ronda y se
 * recortan los podios de cinco a tres, que es el largo del pronóstico.
 */
export async function generarPronosticoReplica(gpId: number): Promise<RespuestaCarga> {
  const no = await soloAdmin();
  if (no) return { ok: false, mensaje: no };

  const db = clienteAdmin();
  const { data: gp } = await db.from('gps').select('ronda').eq('id', gpId).maybeSingle();
  if (!gp) return { ok: false, mensaje: 'No existe esa ronda.' };

  const { data: previas } = await db.from('gps')
    .select('id, ronda, nombre').lt('ronda', gp.ronda).order('ronda', { ascending: false });

  for (const p of previas ?? []) {
    const { data: res } = await db.from('resultados')
      .select('payload').eq('gp_id', p.id).eq('sesion', 'gp').eq('publicado', true).maybeSingle();
    if (!res) continue;

    const r = res.payload as Resultado;
    const payload: Prediccion = {
      qualy_equipos: r.qualy_equipos,
      qualy_podio: r.qualy_podio.slice(0, 3),
      carrera_equipos: r.carrera_equipos,
      carrera_podio: r.carrera_podio.slice(0, 3),
      dotd: r.dotd,
      vuelta_rapida: r.vuelta_rapida,
      interrupciones: r.interrupciones,
      dnf_dsq: r.dnf_dsq,
      stints: r.stints,
    };

    const { error } = await db.from('predicciones').upsert(
      { participante: 'Replica', gp_id: gpId, payload, hora_confiable: false,
        enviado_at: new Date().toISOString() },
      { onConflict: 'participante,gp_id' }
    );
    if (error) return { ok: false, mensaje: `No se pudo guardar: ${error.message}` };

    await recalcularGP(gpId);
    revalidatePath('/');
    revalidatePath('/admin');
    return { ok: true, mensaje: `Réplica cargada copiando el resultado de ${p.nombre} (R${p.ronda}).` };
  }

  return { ok: false, mensaje: 'Ninguna ronda anterior tiene resultado publicado todavía.' };
}

// ------------------------------------------------------------------
// Vinculación de cuentas de Discord con participantes
// ------------------------------------------------------------------

/**
 * Cada persona entra una vez con Discord, lo que le crea su fila en
 * `perfiles`, y después un admin la enlaza con su nombre histórico en la
 * porra. Hasta ese momento puede iniciar sesión pero no pronosticar,
 * porque `mi_participante()` no le devuelve nada.
 *
 * La escritura va con clave de servicio porque `participantes` no tiene
 * política de escritura: nadie puede reasignarse a sí mismo, ni siquiera
 * su propia fila. El guardia es `soloAdmin()`.
 */
export async function vincularPerfil(
  perfilId: string, participante: string
): Promise<Respuesta> {
  const no = await soloAdmin();
  if (no) return { ok: false, mensaje: no };

  const db = clienteAdmin();
  const { error } = await db.from('participantes')
    .update({ perfil_id: perfilId }).eq('nombre', participante);

  if (error) {
    // 23505: `participantes.perfil_id` es unique, así que ese perfil ya
    // está enlazado a otro participante.
    if (error.code === '23505') {
      return { ok: false, mensaje: 'Esa cuenta ya está vinculada a otro participante. Desvinculala primero.' };
    }
    return { ok: false, mensaje: `No se pudo vincular: ${error.message}` };
  }

  revalidatePath('/admin');
  revalidatePath('/');
  return { ok: true, mensaje: `Cuenta vinculada a ${participante}.` };
}

/** Deshace la vinculación. Los pronósticos ya enviados no se tocan. */
export async function desvincularParticipante(participante: string): Promise<Respuesta> {
  const no = await soloAdmin();
  if (no) return { ok: false, mensaje: no };

  const db = clienteAdmin();
  const { error } = await db.from('participantes')
    .update({ perfil_id: null }).eq('nombre', participante);
  if (error) return { ok: false, mensaje: `No se pudo desvincular: ${error.message}` };

  revalidatePath('/admin');
  revalidatePath('/');
  return { ok: true, mensaje: `${participante} quedó sin cuenta asociada.` };
}
