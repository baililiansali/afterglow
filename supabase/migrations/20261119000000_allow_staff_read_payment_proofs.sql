grant select on table public.payment_proofs to authenticated;

create policy "Admins and staff can read payment proof records"
on public.payment_proofs
for select
to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'staff')
);

create policy "Admins and staff can read payment proof files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'payment-proofs'
  and (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'staff')
  )
);
