create extension if not exists pgcrypto;

create table if not exists public.cloudflare_mirror_events (
  event_id uuid primary key,
  idempotency_key text unique not null,
  source text not null default 'data-api-proxy',
  occurred_at timestamptz not null,
  mirrored_at timestamptz not null default now(),
  user_id text,
  method text not null,
  path text not null,
  query_params jsonb not null default '{}'::jsonb,
  request_headers jsonb not null default '{}'::jsonb,
  request_content_type text,
  request_body_json jsonb,
  request_body_text text,
  request_body_bytes integer not null default 0,
  response_status integer not null,
  response_content_type text,
  response_body_json jsonb,
  response_body_text text,
  response_body_bytes integer not null default 0,
  retry_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_cloudflare_mirror_events_user_id
  on public.cloudflare_mirror_events (user_id);

create index if not exists idx_cloudflare_mirror_events_occurred_at
  on public.cloudflare_mirror_events (occurred_at desc);

create index if not exists idx_cloudflare_mirror_events_path
  on public.cloudflare_mirror_events (path);

alter table public.cloudflare_mirror_events enable row level security;

revoke all on table public.cloudflare_mirror_events from anon;
revoke all on table public.cloudflare_mirror_events from authenticated;
