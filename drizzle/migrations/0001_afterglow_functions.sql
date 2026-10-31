create or replace function public.get_room_busy_slots(_room_id uuid, _date date)
returns table(start_time time, end_time time) language sql stable security definer set search_path = public as $$
  select start_time, end_time from public.reservations
  where room_id = _room_id and booking_date = _date and status in ('pending','approved','checked_in')
  order by start_time
$$;
grant execute on function public.get_room_busy_slots(uuid, date) to anon, authenticated;

create or replace function public.create_reservation(
  _room_id uuid, _date date, _start time, _end time, _guests int, _requests text, _items jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.rooms; s public.business_settings; hours numeric; res_id uuid; ord_id uuid; it jsonb; mi public.menu_items; q int; subtotal numeric := 0;
begin
  if auth.uid() is null then raise exception 'Please sign in to reserve.'; end if;
  select * into r from public.rooms where id = _room_id;
  if r.id is null or not r.is_active or r.maintenance_status then raise exception 'This room is not available for booking.'; end if;
  select * into s from public.business_settings where id = 1;
  if _date < current_date or _date > current_date + 60 then raise exception 'Choose a date within the next 60 days.'; end if;
  if _end <= _start then raise exception 'End time must be after start time.'; end if;
  if _start < s.opening_time or _end > s.closing_time then raise exception 'Times must be within operating hours.'; end if;
  hours := extract(epoch from (_end - _start)) / 3600.0;
  if hours < s.min_duration_hours or hours > s.max_duration_hours then raise exception 'Duration must be between % and % hours.', s.min_duration_hours, s.max_duration_hours; end if;
  if _guests < 1 or _guests > r.capacity then raise exception 'Guest count must be between 1 and %.', r.capacity; end if;
  if exists (select 1 from public.reservations x where x.room_id = _room_id and x.booking_date = _date
             and x.status in ('pending','approved','checked_in') and _start < x.end_time and _end > x.start_time) then
    raise exception 'That time slot is already booked. Please pick another.';
  end if;
  insert into public.reservations (user_id, room_id, booking_date, start_time, end_time, guest_count, room_rate_snapshot, room_total, special_requests)
  values (auth.uid(), _room_id, _date, _start, _end, _guests, r.hourly_rate, round(r.hourly_rate * hours, 2), nullif(left(_requests, 500), ''))
  returning id into res_id;
  if jsonb_array_length(coalesce(_items,'[]'::jsonb)) > 0 then
    insert into public.food_orders (user_id, reservation_id, order_type) values (auth.uid(), res_id, 'pre_order') returning id into ord_id;
    for it in select * from jsonb_array_elements(_items) loop
      q := (it->>'quantity')::int;
      if q is null or q < 1 or q > 50 then raise exception 'Invalid quantity.'; end if;
      select * into mi from public.menu_items where id = (it->>'menu_item_id')::uuid;
      if mi.id is null or not mi.is_available then raise exception 'An item in your cart is no longer available.'; end if;
      insert into public.food_order_items (food_order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, line_total)
      values (ord_id, mi.id, mi.name, mi.price, q, mi.price * q);
      subtotal := subtotal + mi.price * q;
    end loop;
    update public.food_orders set food_subtotal = subtotal where id = ord_id;
  end if;
  return res_id;
end $$;
revoke execute on function public.create_reservation(uuid, date, time, time, int, text, jsonb) from public, anon;
grant execute on function public.create_reservation(uuid, date, time, time, int, text, jsonb) to authenticated;

create or replace function public.cancel_my_reservation(_reservation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.reservations set status = 'cancelled', updated_at = now()
  where id = _reservation_id and user_id = auth.uid() and status in ('pending','approved');
  if not found then raise exception 'This booking can no longer be cancelled.'; end if;
  update public.food_orders set status = 'cancelled' where reservation_id = _reservation_id and status = 'pending';
end $$;
revoke execute on function public.cancel_my_reservation(uuid) from public, anon;
grant execute on function public.cancel_my_reservation(uuid) to authenticated;

create or replace function public.guard_reservation_update()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status in ('approved','checked_in') and old.status not in ('approved','checked_in') then
    if exists (select 1 from public.reservations x where x.id <> new.id and x.room_id = new.room_id and x.booking_date = new.booking_date
      and x.status in ('approved','checked_in') and new.start_time < x.end_time and new.end_time > x.start_time) then
      raise exception 'Conflicts with another approved booking for this room.';
    end if;
  end if;
  if new.status = 'checked_in' and old.status <> 'checked_in' then new.checked_in_at := now(); end if;
  if new.status = 'completed' and old.status <> 'completed' then new.checked_out_at := now(); end if;
  return new;
end $$;
create trigger reservations_guard before update on public.reservations for each row execute function public.guard_reservation_update();

create or replace function public.create_reservation_v2(
  _room_id uuid, _date date, _start time, _end time, _guests int, _requests text, _items jsonb default '[]'::jsonb, _payment_method text default 'cash')
returns uuid language plpgsql security definer set search_path = public as $$
declare res_id uuid;
begin
  if _payment_method not in ('cash','gcash') then raise exception 'Choose a valid payment method.'; end if;
  res_id := public.create_reservation(_room_id, _date, _start, _end, _guests, _requests, _items);
  update public.reservations set payment_method = _payment_method where id = res_id;
  return res_id;
end $$;
revoke execute on function public.create_reservation_v2(uuid, date, time, time, int, text, jsonb, text) from public, anon;
grant execute on function public.create_reservation_v2(uuid, date, time, time, int, text, jsonb, text) to authenticated;

create or replace function public.create_reservation_v3(
  _room_id uuid, _date date, _start time, _end time, _guests int, _requests text, _items jsonb,
  _payment_method text, _payer_name text default null, _payer_account text default null, _payment_ref text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare res_id uuid;
begin
  if _payment_method = 'gcash' then
    if coalesce(length(trim(_payer_name)),0) < 2 or length(_payer_name) > 100 then raise exception 'Enter the e-wallet account name.'; end if;
    if coalesce(_payer_account,'') !~ '^[0-9+ -]{7,20}$' then raise exception 'Enter a valid e-wallet account number.'; end if;
    if length(coalesce(_payment_ref,'')) > 40 then raise exception 'Reference number is too long.'; end if;
  end if;
  res_id := public.create_reservation_v2(_room_id, _date, _start, _end, _guests, _requests, _items, _payment_method);
  if _payment_method = 'gcash' then
    update public.reservations set payer_name = trim(_payer_name), payer_account_number = trim(_payer_account),
      payment_reference = nullif(trim(coalesce(_payment_ref,'')),'') where id = res_id;
  end if;
  return res_id;
end $$;
revoke execute on function public.create_reservation_v3(uuid, date, time, time, int, text, jsonb, text, text, text, text) from public, anon;
grant execute on function public.create_reservation_v3(uuid, date, time, time, int, text, jsonb, text, text, text, text) to authenticated;

create function public.create_in_room_order(_reservation_id uuid, _items jsonb, _notes text,
  _payment_method text default 'cash', _payer_name text default null, _payer_account text default null, _payment_ref text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare res public.reservations; ord_id uuid; it jsonb; mi public.menu_items; q int; subtotal numeric := 0; pm text := coalesce(_payment_method,'cash');
begin
  if pm not in ('cash','gcash') then raise exception 'Choose a valid payment method.'; end if;
  if pm = 'gcash' then
    if coalesce(length(trim(_payer_name)),0) < 2 or length(_payer_name) > 100 then raise exception 'Enter the e-wallet account name.'; end if;
    if coalesce(trim(_payer_account),'') !~ '^[0-9+ -]{7,20}$' then raise exception 'Enter a valid e-wallet account number.'; end if;
  end if;
  select * into res from public.reservations where id = _reservation_id;
  if res.id is null or res.user_id <> auth.uid() then raise exception 'Reservation not found.'; end if;
  if res.status <> 'checked_in' then raise exception 'In-room ordering opens once you are checked in.'; end if;
  if jsonb_array_length(coalesce(_items,'[]'::jsonb)) = 0 then raise exception 'Add at least one item.'; end if;
  insert into public.food_orders (user_id, reservation_id, order_type, special_instructions, payment_method, payer_name, payer_account_number, payment_reference)
  values (auth.uid(), res.id, 'in_room', nullif(left(coalesce(_notes,''),300),''), pm,
    case when pm='gcash' then trim(_payer_name) end,
    case when pm='gcash' then trim(_payer_account) end,
    nullif(trim(coalesce(_payment_ref,'')),''))
  returning id into ord_id;
  for it in select * from jsonb_array_elements(_items) loop
    q := (it->>'quantity')::int;
    if q is null or q < 1 or q > 50 then raise exception 'Invalid quantity.'; end if;
    select * into mi from public.menu_items where id = (it->>'menu_item_id')::uuid;
    if mi.id is null or not mi.is_available then raise exception 'An item in your cart is no longer available.'; end if;
    insert into public.food_order_items (food_order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, line_total)
    values (ord_id, mi.id, mi.name, mi.price, q, mi.price * q);
    subtotal := subtotal + mi.price * q;
  end loop;
  update public.food_orders set food_subtotal = subtotal where id = ord_id;
  return ord_id;
end $$;
revoke execute on function public.create_in_room_order(uuid, jsonb, text, text, text, text, text) from public, anon;
grant execute on function public.create_in_room_order(uuid, jsonb, text, text, text, text, text) to authenticated;

create extension if not exists pg_cron;
create or replace function public.expire_no_show_reservations()
returns void language plpgsql security definer set search_path = public as $$
begin
  with expired as (
    update public.reservations set status = 'cancelled',
      rejection_reason = coalesce(rejection_reason, 'No show — booking time passed without check-in')
    where status in ('pending','approved')
      and (booking_date + end_time) < (now() at time zone 'Asia/Manila')
    returning id
  )
  update public.food_orders set status = 'cancelled'
  where reservation_id in (select id from expired) and status = 'pending';
end $$;
revoke execute on function public.expire_no_show_reservations() from public, anon;
grant execute on function public.expire_no_show_reservations() to authenticated;