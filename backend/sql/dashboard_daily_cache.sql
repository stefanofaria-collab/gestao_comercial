create table if not exists public.dashboard_daily_cache (
    cache_key text primary key,
    page text not null,
    params jsonb not null default '{}'::jsonb,
    payload jsonb not null,
    source_date date not null,
    updated_at timestamptz not null default now(),
    refresh_started_at timestamptz,
    refresh_error text
);

create index if not exists idx_dashboard_daily_cache_page
    on public.dashboard_daily_cache (page);

create index if not exists idx_dashboard_daily_cache_source_date
    on public.dashboard_daily_cache (source_date desc);
