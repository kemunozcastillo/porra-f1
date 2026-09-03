-- ============================================================
-- Porra F1 — esquema Postgres (Supabase / Neon)
-- Ejecutar en el SQL Editor de Supabase, de una sola vez.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Catálogos ----------

create table if not exists equipos (
  nombre text primary key,
  color  text default '#8B97A5',
  activo boolean not null default true
);

create table if not exists pilotos (
  nombre text primary key,
  equipo text references equipos(nombre),
  activo boolean not null default true
);

create table if not exists compuestos (
  codigo text primary key,          -- S, M, H, I, W
  nombre text not null              -- "Blando (S)"
);

-- ---------- Calendario ----------

create type tipo_gp   as enum ('normal', 'sprint');
create type estado_gp as enum ('proximo', 'abierto', 'cerrado', 'finalizado');
create type sesion    as enum ('gp', 'sprint');

create table if not exists gps (
  id            serial primary key,
  ronda         int  not null,
  slug          text not null unique,          -- 'australia', 'spa'
  nombre        text not null,                 -- 'Australia'
  circuito      text not null,
  tipo          tipo_gp   not null default 'normal',
  estado        estado_gp not null default 'proximo',
  abre_at       timestamptz not null,
  fp1_at        timestamptz,                   -- inicio de FP1: límite del boost a ciegas
  cierra_at     timestamptz not null,          -- cierre nominal del pronóstico
  -- Largada de cada sesión. Un pronóstico que llega después de una de
  -- estas horas no puntúa esa parte. Sin cargar = la sesión puntúa igual.
  sprint_qualy_at   timestamptz,
  sprint_carrera_at timestamptz,
  qualy_at          timestamptz,
  carrera_at        timestamptz,
  unique (ronda)
);

-- ---------- Participantes ----------

-- Se enlaza 1:1 con auth.users de Supabase.
create table if not exists perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null unique,
  avatar_url text,
  es_admin   boolean not null default false,
  activo     boolean not null default true,
  creado_at  timestamptz not null default now()
);

-- Participantes históricos o de referencia que no tienen login
-- ("Temporada 2024", "Chat GPT", etc.). nombre único compartido con perfiles.
create table if not exists participantes (
  nombre    text primary key,
  perfil_id uuid unique references perfiles(id) on delete set null,
  tipo      text not null default 'humano',    -- humano | ia | historico
  activo    boolean not null default true
);

-- ---------- Pronósticos ----------

-- Un pronóstico por fin de semana, no uno por sesión.
-- En las rondas con sprint el MISMO pronóstico se puntúa dos veces:
-- contra el resultado del sprint (sólo parrillas y podios) y contra el
-- del Gran Premio (todo). Así funcionaba la planilla y así se mantiene.
create table if not exists predicciones (
  id           bigserial primary key,
  participante text not null references participantes(nombre) on delete cascade,
  gp_id        int  not null references gps(id) on delete cascade,
  payload      jsonb not null,
  -- Lo estampa Postgres, no el navegador. Un solo reloj para todos.
  enviado_at   timestamptz not null default now(),
  -- Falso en todo lo migrado del Excel: ahí el timestamp lo ponía la PC
  -- de cada uno, así que la misma hora significaba cosas distintas según
  -- el país. Cuando es falso, el corte por horario no se aplica y sólo
  -- vale lo que diga `anulado`.
  hora_confiable boolean not null default true,
  -- Anulación manual de bloques, para cuando el reloj no alcanza.
  -- Forma: {"sprint": ["qualy"], "gp": ["qualy","carrera"]}
  -- Se combina con el corte por horario: basta que una de las dos diga
  -- que ese bloque no puntúa.
  anulado      jsonb not null default '{}'::jsonb,
  unique (participante, gp_id)
);

-- payload:
-- {
--   "qualy_equipos":   ["Mercedes", ... 11 items ...],
--   "qualy_podio":     ["Russell","Antonelli","Hadjar"],
--   "carrera_equipos": [... 11 items ...],
--   "carrera_podio":   ["Russell","Antonelli","Leclerc"],
--   "dotd":            "Verstappen",
--   "interrupciones":  3,
--   "vuelta_rapida":   "Verstappen",
--   "stints":          ["M","H"],
--   "dnf_dsq":         6
-- }
-- En el sprint sólo cuentan las cuatro primeras claves.

-- ---------- Comodines ----------
--
-- Viven aparte del pronóstico porque tienen su propio calendario: el
-- boost a ciegas se declara antes de la FP1, cuando todavía no se corrió
-- una vuelta, mientras que el pronóstico se puede seguir editando hasta
-- la clasificación. Atarlos a la misma fila obligaría a decidir los dos
-- al mismo tiempo.

create type tipo_comodin as enum ('boost', 'boost_ciegas');

create table if not exists comodines (
  participante text not null references participantes(nombre) on delete cascade,
  tipo         tipo_comodin not null,
  gp_id        int not null references gps(id) on delete cascade,
  declarado_at timestamptz not null default now(),
  -- Uno de cada tipo por temporada. Lo garantiza la base, no la app.
  primary key (participante, tipo)
);

-- Tampoco se pueden quemar los dos en la misma ronda.
create unique index if not exists idx_comodin_ronda
  on comodines (participante, gp_id);

-- ---------- Resultados oficiales ----------

create table if not exists resultados (
  gp_id      int    not null references gps(id) on delete cascade,
  sesion     sesion not null default 'gp',
  payload    jsonb  not null,   -- misma forma, con podios de 5 posiciones
  publicado  boolean not null default false,
  cargado_at timestamptz not null default now(),
  primary key (gp_id, sesion)
);

-- ---------- Puntajes (materializados por el motor) ----------

create table if not exists puntajes (
  participante text not null references participantes(nombre) on delete cascade,
  gp_id        int  not null references gps(id) on delete cascade,
  sesion       sesion not null,
  puntos       int  not null default 0,
  detalle      jsonb not null default '{}'::jsonb,  -- desglose por ítem
  calculado_at timestamptz not null default now(),
  primary key (participante, gp_id, sesion)
);

-- Medallas y puntos estilo F1 por GP (se recalculan junto con los puntajes).
create table if not exists posiciones_gp (
  participante text not null references participantes(nombre) on delete cascade,
  gp_id        int  not null references gps(id) on delete cascade,
  total_gp     int  not null,          -- puntaje GP + puntaje sprint
  posicion     int  not null,          -- 1, 2, 3, ...
  medalla      int  not null default 0,-- 3 si 1º, 2 si 2º, 1 si 3º
  puntos_f1    int  not null default 0,-- 25/18/15/12/10/8/6/4/2/1
  primary key (participante, gp_id)
);

create index if not exists idx_pred_gp   on predicciones (gp_id);
create index if not exists idx_punt_gp   on puntajes (gp_id, sesion);
create index if not exists idx_pos_gp    on posiciones_gp (gp_id);

-- ---------- Vista de clasificación ----------

create or replace view clasificacion as
with base as (
  select
    p.nombre as participante,
    p.tipo,
    coalesce(sum(pg.total_gp), 0)  as puntos_sesiones,
    coalesce(sum(pg.medalla), 0)   as puntos_medallas,
    coalesce(sum(pg.puntos_f1), 0) as puntos_f1,
    count(*) filter (where pg.medalla = 3) as oros,
    count(*) filter (where pg.medalla = 2) as platas,
    count(*) filter (where pg.medalla = 1) as bronces
  from participantes p
  left join posiciones_gp pg on pg.participante = p.nombre
  where p.activo
  group by p.nombre, p.tipo
),
bonus as (
  -- El boost duplica únicamente la sesión de Gran Premio.
  -- Si la ronda tuvo sprint, ese puntaje no se dobla.
  select c.participante, coalesce(sum(pt.puntos), 0) as puntos_boost
  from comodines c
  join puntajes pt
    on pt.participante = c.participante
   and pt.gp_id = c.gp_id
   and pt.sesion = 'gp'
  group by c.participante
)
select
  b.participante,
  b.tipo,
  b.puntos_sesiones + b.puntos_medallas + coalesce(bo.puntos_boost, 0) as total,
  b.puntos_sesiones,
  b.puntos_medallas,
  coalesce(bo.puntos_boost, 0) as puntos_boost,
  b.puntos_f1,
  b.oros, b.platas, b.bronces
from base b
left join bonus bo on bo.participante = b.participante
order by total desc;

-- ---------- Seguridad (RLS) ----------

alter table perfiles      enable row level security;
alter table participantes enable row level security;
alter table predicciones  enable row level security;
alter table resultados    enable row level security;
alter table puntajes      enable row level security;
alter table posiciones_gp enable row level security;
alter table gps           enable row level security;
alter table equipos       enable row level security;
alter table pilotos       enable row level security;
alter table compuestos    enable row level security;

-- Lectura pública de catálogos y resultados
create policy "lectura publica gps"        on gps           for select using (true);
create policy "lectura publica equipos"    on equipos       for select using (true);
create policy "lectura publica pilotos"    on pilotos       for select using (true);
create policy "lectura publica compuestos" on compuestos    for select using (true);
create policy "lectura publica perfiles"   on perfiles      for select using (true);
create policy "lectura publica particip"   on participantes for select using (true);
create policy "lectura publica puntajes"   on puntajes      for select using (true);
create policy "lectura publica posiciones" on posiciones_gp for select using (true);
create policy "lectura resultados publicados" on resultados for select using (publicado);

-- Función auxiliar: nombre del participante del usuario autenticado
create or replace function mi_participante() returns text
language sql stable security definer as $$
  select nombre from participantes where perfil_id = auth.uid()
$$;

create or replace function soy_admin() returns boolean
language sql stable security definer as $$
  select coalesce((select es_admin from perfiles where id = auth.uid()), false)
$$;

-- Un pronóstico ajeno sólo es visible una vez cerrada la ronda.
create policy "ver mis pronosticos" on predicciones for select using (
  participante = mi_participante()
  or soy_admin()
  or exists (
    select 1 from gps g where g.id = predicciones.gp_id and now() > g.cierra_at
  )
);

-- Llegar tarde se permite: lo que no se permite es puntuar hacia atrás.
-- La base deja escribir hasta que largue la carrera, y el motor descuenta
-- las sesiones que ya se corrieron al momento de `enviado_at`. Si el
-- calendario no tiene cargada la hora de largada, se toma el cierre más
-- tres días, que cubre el fin de semana entero.
create policy "crear mi pronostico" on predicciones for insert with check (
  participante = mi_participante()
  and exists (
    select 1 from gps g
    where g.id = predicciones.gp_id
      and now() < coalesce(g.carrera_at, g.cierra_at + interval '3 days')
  )
);

create policy "editar mi pronostico" on predicciones for update using (
  participante = mi_participante()
  and exists (
    select 1 from gps g
    where g.id = predicciones.gp_id
      and now() < coalesce(g.carrera_at, g.cierra_at + interval '3 days')
  )
);

create policy "editar mi perfil" on perfiles for update using (id = auth.uid());

-- ---------- Comodines: los plazos los impone la base ----------

alter table comodines enable row level security;

create policy "lectura publica comodines" on comodines for select using (
  participante = mi_participante()
  or soy_admin()
  or exists (
    select 1 from gps g where g.id = comodines.gp_id and now() > g.cierra_at
  )
);

create policy "declarar comodin" on comodines for insert with check (
  participante = mi_participante()
  and exists (
    select 1 from gps g
    where g.id = comodines.gp_id
      and now() < case
            -- A ciegas: antes de que arranque la FP1. Si el calendario no
            -- tiene cargada la FP1, no se puede declarar: mejor bloquear
            -- que dejar pasar uno fuera de plazo.
            when comodines.tipo = 'boost_ciegas' then g.fp1_at
            else g.cierra_at
          end
  )
);

-- Se puede retirar o mover mientras el plazo de ese tipo siga abierto.
create policy "retirar comodin" on comodines for delete using (
  participante = mi_participante()
  and exists (
    select 1 from gps g
    where g.id = comodines.gp_id
      and now() < case when comodines.tipo = 'boost_ciegas' then g.fp1_at
                       else g.cierra_at end
  )
);
