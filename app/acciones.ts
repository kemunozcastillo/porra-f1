'use server';

import { revalidatePath } from 'next/cache';
import { clienteServidor, clienteAdmin } from '@/lib/supabase';
import { recalcularGP } from '@/lib/recalcular';
import type { Prediccion, Resultado, Sesion } from '@/lib/puntaje';

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
  if (!user) return { ok: false, mensaje: 'Iniciá sesión para pronosticar.' };
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
  if (!user) return { ok: false, mensaje: 'Iniciá sesión.' };
  if (!nombre) return { ok: false, mensaje: 'Tu cuenta todavía no está vinculada a un participante.' };

  const { error } = await supabase.from('comodines').insert({ participante: nombre, tipo, gp_id: gpId });

  if (error) {
    // 23505 = clave duplicada: o ya lo usó, o ya tiene otro comodín en esta ronda.
    if (error.code === '23505') {
      return { ok: false, mensaje: 'Ya usaste ese comodín, o ya tenés uno declarado en esta ronda.' };
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
  if (!nombre) return { ok: false, mensaje: 'Iniciá sesión.' };

  const { error } = await supabase.from('comodines')
    .delete().eq('participante', nombre).eq('gp_id', gpId).eq('tipo', tipo);
  if (error) return { ok: false, mensaje: 'El plazo ya cerró: el comodín queda quemado.' };

  revalidatePath('/pronostico');
  return { ok: true, mensaje: 'Comodín retirado.' };
}

/** Carga o corrige un resultado oficial y dispara el recálculo de la ronda. */
export async function publicarResultado(
  gpId: number, sesion: Sesion, payload: Resultado
): Promise<Respuesta> {
  const { supabase, user } = await participanteActual();
  if (!user) return { ok: false, mensaje: 'Iniciá sesión.' };

  const { data: perfil } = await supabase.from('perfiles').select('es_admin').eq('id', user.id).maybeSingle();
  if (!perfil?.es_admin) return { ok: false, mensaje: 'Necesitás permisos de admin.' };

  const db = clienteAdmin();
  const { error } = await db.from('resultados').upsert(
    { gp_id: gpId, sesion, payload, publicado: true, cargado_at: new Date().toISOString() },
    { onConflict: 'gp_id,sesion' }
  );
  if (error) return { ok: false, mensaje: 'No se pudo guardar el resultado.' };

  const { filas } = await recalcularGP(gpId);
  revalidatePath('/');
  revalidatePath('/admin');
  return { ok: true, mensaje: `Resultado publicado. Se recalcularon ${filas} pronósticos.` };
}
