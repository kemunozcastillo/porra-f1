-- Consultas de mantenimiento habituales.

-- Quién entró con Discord y todavía no está vinculado a un participante
select p.id, p.nombre, p.creado_at
from perfiles p
left join participantes pa on pa.perfil_id = p.id
where pa.nombre is null
order by p.creado_at desc;

-- Vincular un login con su nombre histórico en la porra
-- update participantes set perfil_id = 'UUID' where nombre = 'KevinVlogs';

-- Dar permisos de admin
-- update perfiles set es_admin = true where nombre = 'TU_NOMBRE';

-- Cargar los cierres de sprint que el Excel no guardaba
-- update gps set cierra_sprint_at = '2026-09-05 09:00+00' where slug = 'monza';

-- Estado de la temporada
select g.ronda, g.nombre, g.estado,
       count(distinct pr.participante) as pronosticos,
       bool_or(r.publicado)            as resultado_publicado
from gps g
left join predicciones pr on pr.gp_id = g.id
left join resultados   r  on r.gp_id  = g.id
group by g.ronda, g.nombre, g.estado
order by g.ronda;
