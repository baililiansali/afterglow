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
