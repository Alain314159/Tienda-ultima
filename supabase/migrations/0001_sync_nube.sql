-- Sincronización con la nube para Tienda Pro (Supabase).
-- Cada fila de la app viaja como JSON con su dueño. La tabla no tiene políticas
-- directas: solo se llega a ella a través de sync_empujar y sync_tirar.
-- Se puede ejecutar varias veces sin romper nada.

create sequence if not exists public.sync_version_seq;

create table if not exists public.sync_registros (
  user_id uuid not null references auth.users (id) on delete cascade,
  tabla text not null,
  registro_id text not null,
  dispositivo text not null,
  ts bigint not null,
  borrado boolean not null default false,
  datos jsonb,
  version bigint not null default nextval('public.sync_version_seq'),
  actualizado_en timestamptz not null default now(),
  constraint sync_registros_pk primary key (user_id, tabla, registro_id),
  constraint sync_registros_tabla_chk check (
    tabla = any (array[
      'productos', 'lotes', 'ventas', 'compras', 'ajustes', 'arqueos', 'movCaja',
      'cierres', 'capital', 'retiros', 'socios', 'distribuciones', 'gastos',
      'pasivos', 'auditorias'
    ])
  )
);

comment on table public.sync_registros is
  'Copia en la nube de cada fila de la app, una por usuario y fila. Se modifica solo con sync_empujar.';

alter table public.sync_registros enable row level security;

revoke all on table public.sync_registros from anon, authenticated;
revoke all on sequence public.sync_version_seq from anon, authenticated;

-- Sube un lote del usuario en sesión. Gana la fila con mayor (ts, dispositivo).
drop function if exists public.sync_empujar(jsonb);
create function public.sync_empujar(filas jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  aceptadas integer := 0;
  f jsonb;
  dueno uuid := auth.uid();
  es_borrado boolean;
begin
  if dueno is null then
    raise exception 'sin-sesion';
  end if;
  if jsonb_typeof(filas) <> 'array' or jsonb_array_length(filas) > 5000 then
    raise exception 'lote-invalido';
  end if;
  for f in select jsonb_array_elements(filas) loop
    if f->>'tabla' is null or f->>'id' is null or f->>'dispositivo' is null or f->>'ts' is null then
      raise exception 'fila-invalida';
    end if;
    es_borrado := coalesce((f->>'borrado')::boolean, false);
    insert into sync_registros as r (user_id, tabla, registro_id, dispositivo, ts, borrado, datos)
      values (dueno, f->>'tabla', f->>'id', f->>'dispositivo', (f->>'ts')::bigint, es_borrado,
              case when es_borrado then null else f->'datos' end)
    on conflict (user_id, tabla, registro_id) do update
      set dispositivo = excluded.dispositivo,
          ts = excluded.ts,
          borrado = excluded.borrado,
          datos = excluded.datos,
          version = nextval('public.sync_version_seq'),
          actualizado_en = now()
      where (excluded.ts, excluded.dispositivo) > (r.ts, r.dispositivo);
    if found then
      aceptadas := aceptadas + 1;
    end if;
  end loop;
  return aceptadas;
end;
$$;

-- Baja lo posterior a un punto de lectura (la versión), para el usuario en sesión.
drop function if exists public.sync_tirar(bigint, integer);
create function public.sync_tirar(desde bigint, limite integer)
returns setof public.sync_registros
language sql
stable
security definer
set search_path = public
as $$
  select * from public.sync_registros
  where user_id = auth.uid() and version > desde
  order by version
  limit least(coalesce(limite, 5000), 5000)
$$;

-- Latido público: toca la base sin datos. Sirve para que el proyecto gratis no se pause.
create or replace function public.sync_latido()
returns timestamptz
language sql
stable
as $$
  select now()
$$;

revoke all on function public.sync_empujar(jsonb) from public, anon;
revoke all on function public.sync_tirar(bigint, integer) from public, anon;
grant execute on function public.sync_empujar(jsonb) to authenticated;
grant execute on function public.sync_tirar(bigint, integer) to authenticated;

notify pgrst, 'reload schema';
