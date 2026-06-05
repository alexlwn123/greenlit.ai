# Supabase Setup

## 1. Create a project

Go to https://supabase.com → New Project. Note your **Project URL** and **anon public key** (Settings → API).

## 2. Add env vars

Edit `frontend/.env.local`:
```
VITE_SUPABASE_URL=https://<your-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

## 3. Run the schema SQL

In your Supabase project → SQL Editor, paste and run:

```sql
-- User profiles (auto-created on sign-up)
create table if not exists public.profiles (
  id        uuid references auth.users on delete cascade primary key,
  email     text,
  full_name text,
  org       text,
  role      text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Own profile" on public.profiles
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Saved analyses
create table if not exists public.analyses (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid references auth.users on delete cascade not null,
  substance_name text,
  result_json    jsonb not null,
  created_at     timestamptz default now()
);

alter table public.analyses enable row level security;

create policy "Own analyses" on public.analyses
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

## 4. Enable Google OAuth (optional)

Supabase Dashboard → Authentication → Providers → Google.
Follow the guide to create OAuth credentials in Google Cloud Console.
Add `http://localhost:5173` (and your prod domain) as an authorized redirect URI.

## 5. Email confirmation (optional)

Authentication → Email → disable "Confirm email" for frictionless sign-up during development.
Re-enable before production launch.
