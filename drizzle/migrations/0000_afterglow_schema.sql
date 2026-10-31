create type public.app_role as enum ('admin','customer');
create type public.room_type as enum ('small','medium','large','vip');
create type public.reservation_status as enum ('pending','approved','rejected','cancelled','checked_in','completed');
create type public.food_order_type as enum ('pre_order','in_room');
create type public.food_order_status as enum ('pending','confirmed','preparing','ready','served','cancelled');
create type public.payment_status as enum ('unpaid','paid');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, phone text, email text, avatar_url text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), new.raw_user_meta_data->>'phone', new.email);
  insert into public.user_roles (user_id, role) values (new.id, 'customer');
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.business_settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'Afterglow',
  contact_email text not null default 'hello@afterglow.ph',
  contact_phone text not null default '+63 917 000 0000',
  address text not null default 'Makati City, Metro Manila',
  opening_time time not null default '14:00',
  closing_time time not null default '23:00',
  min_duration_hours int not null default 1,
  max_duration_hours int not null default 6,
  cancellation_note text not null default 'Free cancellation while a booking is Pending or Approved, up to 2 hours before start.',
  ewallet_provider text not null default 'GCash',
  ewallet_account_name text not null default 'Afterglow',
  ewallet_account_number text not null default '+63 917 000 0000',
  ewallet_instructions text not null default 'Send the exact total and put your booking reference in the message. Show the receipt at the counter.',
  updated_at timestamptz not null default now()
);
grant select on public.business_settings to anon, authenticated;
grant update on public.business_settings to authenticated;
grant all on public.business_settings to service_role;
alter table public.business_settings enable row level security;
create policy "settings public read" on public.business_settings for select to anon, authenticated using (true);
create policy "settings admin update" on public.business_settings for update to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_number text not null unique,
  name text not null,
  room_type room_type not null,
  capacity int not null check (capacity > 0),
  hourly_rate numeric(10,2) not null check (hourly_rate >= 0),
  description text not null default '',
  amenities text[] not null default '{}',
  is_active boolean not null default true,
  maintenance_status boolean not null default false,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.rooms to anon, authenticated;
grant insert, update, delete on public.rooms to authenticated;
grant all on public.rooms to service_role;
alter table public.rooms enable row level security;
create policy "rooms public read" on public.rooms for select to anon, authenticated using (true);
create policy "rooms admin write" on public.rooms for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique default ('AG-' || upper(substr(md5(random()::text),1,6))),
  user_id uuid not null,
  room_id uuid not null references public.rooms(id),
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  guest_count int not null,
  room_rate_snapshot numeric(10,2) not null,
  room_total numeric(10,2) not null,
  special_requests text,
  status reservation_status not null default 'pending',
  payment_status payment_status not null default 'unpaid',
  payment_method text not null default 'cash' check (payment_method in ('cash','gcash')),
  payer_name text, payer_account_number text, payment_reference text,
  rejection_reason text,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, update on public.reservations to authenticated;
grant all on public.reservations to service_role;
alter table public.reservations enable row level security;
create policy "res own or admin read" on public.reservations for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "res admin update" on public.reservations for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  sort_order int not null default 0,
  is_active boolean not null default true
);
grant select on public.menu_categories to anon, authenticated;
grant insert, update, delete on public.menu_categories to authenticated;
grant all on public.menu_categories to service_role;
alter table public.menu_categories enable row level security;
create policy "cat public read" on public.menu_categories for select to anon, authenticated using (true);
create policy "cat admin write" on public.menu_categories for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.menu_categories(id),
  name text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  image_key text,
  image_url text,
  is_available boolean not null default true,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.menu_items to anon, authenticated;
grant insert, update, delete on public.menu_items to authenticated;
grant all on public.menu_items to service_role;
alter table public.menu_items enable row level security;
create policy "items public read" on public.menu_items for select to anon, authenticated using (true);
create policy "items admin write" on public.menu_items for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.food_orders (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique default ('FO-' || upper(substr(md5(random()::text),1,6))),
  user_id uuid not null,
  reservation_id uuid not null references public.reservations(id),
  order_type food_order_type not null,
  status food_order_status not null default 'pending',
  food_subtotal numeric(10,2) not null default 0,
  special_instructions text,
  submitted_at timestamptz not null default now(),
  served_at timestamptz,
  created_at timestamptz not null default now(),
  payment_method text not null default 'cash',
  payment_status public.payment_status not null default 'unpaid',
  payer_name text,
  payer_account_number text,
  payment_reference text
);
grant select, update on public.food_orders to authenticated;
grant all on public.food_orders to service_role;
alter table public.food_orders enable row level security;
create policy "fo own or admin read" on public.food_orders for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "fo admin update" on public.food_orders for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.food_order_items (
  id uuid primary key default gen_random_uuid(),
  food_order_id uuid not null references public.food_orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  item_name_snapshot text not null,
  unit_price_snapshot numeric(10,2) not null,
  quantity int not null check (quantity > 0),
  line_total numeric(10,2) not null
);
grant select on public.food_order_items to authenticated;
grant all on public.food_order_items to service_role;
alter table public.food_order_items enable row level security;
create policy "foi via order" on public.food_order_items for select to authenticated using (
  exists (select 1 from public.food_orders o where o.id = food_order_id and (o.user_id = auth.uid() or public.has_role(auth.uid(),'admin'))));

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null, email text not null, subject text not null, message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
grant insert on public.contact_messages to anon, authenticated;
grant select, update, delete on public.contact_messages to authenticated;
grant all on public.contact_messages to service_role;
alter table public.contact_messages enable row level security;
create policy "contact anyone insert" on public.contact_messages for insert to anon, authenticated with check (length(name) between 1 and 100 and length(email) between 3 and 255 and length(message) between 1 and 2000);
create policy "contact admin read" on public.contact_messages for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "contact admin update" on public.contact_messages for update to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "contact admin delete" on public.contact_messages for delete to authenticated using (public.has_role(auth.uid(),'admin'));

insert into public.business_settings (id) values (1);

insert into public.rooms (room_number, name, room_type, capacity, hourly_rate, description, amenities)
select lpad(n::text,2,'0'),
  case when n<=5 then 'Neon Nook ' when n<=10 then 'Violet Lounge ' when n<=15 then 'Magenta Hall ' else 'Amber VIP Suite ' end || lpad(n::text,2,'0'),
  (case when n<=5 then 'small' when n<=10 then 'medium' when n<=15 then 'large' else 'vip' end)::public.room_type,
  case when n<=5 then 4 when n<=10 then 8 when n<=15 then 12 else 15 end,
  case when n<=5 then 200 when n<=10 then 350 when n<=15 then 500 else 600 end,
  case when n<=5 then 'A cozy booth for duos and small crews. Big sound, intimate glow.'
       when n<=10 then 'Plush sectional seating and a wide screen for birthday squads.'
       when n<=15 then 'Room to dance. Stage lighting, dual mics and a party-ready layout.'
       else 'Our flagship suite with premium sound, private bar counter and lounge sofas.' end,
  case when n<=5 then array['2 wireless mics','HD screen','Mood lighting']
       when n<=10 then array['3 wireless mics','55" screen','Mood lighting','Sofa seating']
       when n<=15 then array['4 wireless mics','75" screen','Stage lights','Dance floor']
       else array['4 premium mics','85" screen','Private bar counter','Lounge sofas','Smart lighting'] end
from generate_series(1,20) n;

insert into public.menu_categories (name, sort_order) values
 ('Snacks',1),('Sharing Platters',2),('Meals',3),('Desserts',4),('Drinks',5);

insert into public.menu_items (category_id, name, description, price, image_key, is_featured)
select c.id, v.name, v.descr, v.price, v.img, v.feat from (values
 ('Snacks','Classic Fries','Golden, crispy and lightly salted.',99,'fries',false),
 ('Snacks','Loaded Nachos','Cheese sauce, salsa, jalapeños and sour cream.',159,'nachos',true),
 ('Sharing Platters','Chicken Wings (6 pcs)','Glazed wings in your pick of buffalo or honey garlic.',189,'wings',true),
 ('Meals','Pepperoni Pizza (10")','Stone-baked with mozzarella and pepperoni.',299,'pizza',true),
 ('Meals','Burger and Fries','Beef patty, cheddar, house sauce, with fries.',179,'burger',false),
 ('Desserts','Chocolate Brownie','Warm fudgy brownie.',89,'brownie',false),
 ('Drinks','Iced Lemon Tea','Freshly brewed, lightly sweetened.',69,'iced-tea',false),
 ('Drinks','Soft Drink','Coke, Sprite or Royal — 330ml.',55,'softdrink',false),
 ('Drinks','Bottled Water','500ml.',35,'water',false)
) as v(cat,name,descr,price,img,feat) join public.menu_categories c on c.name = v.cat;

create policy "avatars own read" on storage.objects for select to authenticated using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_role(auth.uid(),'admin')));
create policy "avatars own insert" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars own update" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars own delete" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

alter publication supabase_realtime add table public.reservations, public.food_orders, public.food_order_items, public.profiles, public.contact_messages, public.rooms, public.menu_items, public.menu_categories, public.business_settings;