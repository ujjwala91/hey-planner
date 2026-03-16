-- ================================================================
-- Hey Planner — Supabase Database Schema
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- ================================================================

-- Profiles table (linked to Supabase auth.users)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  is_pro boolean default false,
  stripe_customer_id text,
  pro_expires_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz default now()
);

-- Row Level Security: users can only see/edit their own profile
alter table profiles enable row level security;
create policy "Users can view own profile"   on profiles for select using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- Tasks table
create table if not exists tasks (
  id text primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  description text default '',
  date text,
  list_id text,
  completed boolean default false,
  status text default 'todo',
  remind_at text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table tasks enable row level security;
create policy "Users can manage own tasks" on tasks for all using (auth.uid() = user_id);

-- Lists table
create table if not exists lists (
  id text primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  icon text default '📋',
  created_at timestamptz default now()
);

alter table lists enable row level security;
create policy "Users can manage own lists" on lists for all using (auth.uid() = user_id);

-- Auto-create profile row when a new user signs up
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, trial_ends_at)
  values (new.id, now() + interval '7 days')
  on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
