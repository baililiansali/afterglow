create or replace function public.guard_staff_reservation_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if has_role(auth.uid(), 'admin'::app_role) then
    return new;
  end if;

  if not has_role(auth.uid(), 'staff'::app_role) then
    raise exception 'You are not authorized to update reservations.';
  end if;

  if new.id is distinct from old.id
    or new.reference_code is distinct from old.reference_code
    or new.user_id is distinct from old.user_id
    or new.guest_count is distinct from old.guest_count
    or (
      new.payment_status is distinct from old.payment_status
      and not (
        current_setting('afterglow.accept_payment_reservation_id', true) = old.id::text
        and old.payment_status = 'unpaid'::payment_status
        and new.payment_status = 'paid'::payment_status
      )
    )
    or new.payment_method is distinct from old.payment_method
    or new.payer_name is distinct from old.payer_name
    or new.payer_account_number is distinct from old.payer_account_number
    or new.payment_reference is distinct from old.payment_reference
    or new.special_requests is distinct from old.special_requests
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Staff cannot modify protected reservation information.';
  end if;

  if old.status = 'pending'::reservation_status then
    if new.status not in (
      'pending'::reservation_status,
      'approved'::reservation_status,
      'rejected'::reservation_status
    ) then
      raise exception 'Invalid status transition for a pending reservation.';
    end if;
  elsif old.status = 'approved'::reservation_status then
    if new.status not in (
      'approved'::reservation_status,
      'checked_in'::reservation_status
    ) then
      raise exception 'Invalid status transition for an approved reservation.';
    end if;

    if new.room_id is distinct from old.room_id
      or new.booking_date is distinct from old.booking_date
      or new.start_time is distinct from old.start_time
      or new.end_time is distinct from old.end_time
      or new.room_rate_snapshot is distinct from old.room_rate_snapshot
      or new.room_total is distinct from old.room_total
      or new.rejection_reason is distinct from old.rejection_reason
    then
      raise exception 'Staff can only edit booking details while a reservation is pending.';
    end if;
  elsif old.status = 'checked_in'::reservation_status then
    if new.status not in (
      'checked_in'::reservation_status,
      'completed'::reservation_status
    ) then
      raise exception 'Invalid status transition for an active session.';
    end if;

    if new.room_id is distinct from old.room_id
      or new.booking_date is distinct from old.booking_date
      or new.start_time is distinct from old.start_time
      or new.end_time is distinct from old.end_time
      or new.room_rate_snapshot is distinct from old.room_rate_snapshot
      or new.room_total is distinct from old.room_total
      or new.rejection_reason is distinct from old.rejection_reason
    then
      raise exception 'Staff cannot edit booking details after check-in.';
    end if;
  else
    if new.status is distinct from old.status
      or new.room_id is distinct from old.room_id
      or new.booking_date is distinct from old.booking_date
      or new.start_time is distinct from old.start_time
      or new.end_time is distinct from old.end_time
      or new.room_rate_snapshot is distinct from old.room_rate_snapshot
      or new.room_total is distinct from old.room_total
      or new.rejection_reason is distinct from old.rejection_reason
      or new.checked_out_at is distinct from old.checked_out_at
    then
      raise exception 'This reservation can no longer be modified by staff.';
    end if;
  end if;

  return new;
end;
$function$;

create or replace function public.accept_payment(_target_type text, _target_id uuid)
returns table (id uuid, payment_status public.payment_status)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
    or not (
      public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'staff')
    ) then
    raise exception 'Only staff or administrators can accept payments.'
      using errcode = '42501';
  end if;

  if _target_type = 'reservation' then
    perform set_config('afterglow.accept_payment_reservation_id', _target_id::text, true);

    return query
      update public.reservations as r
      set payment_status = 'paid'
      where r.id = _target_id
        and r.payment_status = 'unpaid'
        and r.status not in ('rejected', 'cancelled')
      returning r.id, r.payment_status;
  elsif _target_type = 'food_order' then
    if not exists (
      select 1
      from public.food_orders as o
      join public.reservations as r on r.id = o.reservation_id
      where o.id = _target_id
        and o.status <> 'cancelled'
        and r.payment_status = 'paid'
    ) then
      raise exception 'The room payment must be accepted before the food payment.';
    end if;

    return query
      update public.food_orders as o
      set payment_status = 'paid'
      where o.id = _target_id
        and o.payment_status = 'unpaid'
        and o.status <> 'cancelled'
      returning o.id, o.payment_status;
  else
    raise exception 'Invalid payment target.';
  end if;
end;
$$;

revoke all on function public.accept_payment(text, uuid) from public, anon;
grant execute on function public.accept_payment(text, uuid) to authenticated;
