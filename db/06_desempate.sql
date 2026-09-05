-- Desempate del acumulado por criterio olímpico.
--
-- `clasificacion` ordenaba sólo por `total`, así que dos empatados a
-- puntos salían en el orden que quisiera Postgres. Ahora el empate lo
-- rompe el medallero: primero quien ganó más rondas, luego platas,
-- luego bronces y, si sigue, cuartos puestos. El nombre va al final
-- como último recurso, para que el orden sea estable entre consultas
-- aunque dos personas coincidan en absolutamente todo.
--
-- Se añade `cuartos` a la vista porque hace falta para el desempate y
-- porque ya lo expone `medallero`: tenerlo en ambas evita cruzarlas.

create or replace view clasificacion as
with base as (
  select
    p.nombre as participante,
    p.tipo,
    coalesce(sum(pg.total_gp), 0)  as puntos_sesiones,
    coalesce(sum(pg.medalla), 0)   as puntos_medallas,
    coalesce(sum(pg.puntos_f1), 0) as puntos_f1,
    count(*) filter (where pg.medalla = 3)  as oros,
    count(*) filter (where pg.medalla = 2)  as platas,
    count(*) filter (where pg.medalla = 1)  as bronces,
    count(*) filter (where pg.posicion = 4) as cuartos
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
  b.oros, b.platas, b.bronces, b.cuartos
from base b
left join bonus bo on bo.participante = b.participante
order by total desc, b.oros desc, b.platas desc, b.bronces desc, b.cuartos desc, b.participante;

-- El campeonato paralelo ya desempataba por victorias y podios, que es
-- el criterio de la F1 de verdad. Sólo le falta un último recurso
-- determinista para que el orden no baile entre consultas.
create or replace view campeonato_f1 as
select
  p.nombre as participante,
  p.tipo,
  coalesce(sum(pg.puntos_f1), 0) as puntos,
  count(*) filter (where pg.posicion = 1) as victorias,
  count(*) filter (where pg.posicion <= 3) as podios,
  count(*) filter (where pg.puntos_f1 > 0) as rondas_en_puntos,
  max(pg.puntos_f1) as mejor_ronda
from participantes p
left join posiciones_gp pg on pg.participante = p.nombre
where p.activo
group by p.nombre, p.tipo
order by puntos desc, victorias desc, podios desc, p.nombre;
