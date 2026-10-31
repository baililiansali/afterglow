<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
# Afterglow project rules

- The site source of truth is the user's zip export ("afterglow-room-dining-main"). Keep its structure, routes and Midnight Violet palette; never restyle it.
- Admin mutation buttons and admin status-filter buttons look alike (e.g. "Approve" vs "Approved" filter): in tests, always scope clicks to the booking/order card and use exact matching, or you click the wrong control.
- Admin/client updates must verify affected rows (`.select()` after update) because RLS can silently drop updates with no error; admin update policies carry WITH CHECK.
- Booking rules live in database functions (create_reservation, create_in_room_order, cancel_my_reservation, guard trigger) — never move price/slot validation into the browser.
- First sign-up becomes admin via the handle_new_user trigger; keep the auth users table empty of test accounts.
- Admin dashboard sections live in src/components/admin/ (one file per tab, shared types/hooks in shared.tsx); src/routes/admin.tsx only gates access and groups tabs — keeps the 1600-line page navigable.
- Live updates: one LiveSync listener (src/lib/live-sync.tsx) maps table changes to query keys; add new tables there and to the realtime publication instead of per-page subscriptions.
- expire_no_show_reservations must stay granted to authenticated: pages call it before listing bookings, and revoking it reintroduces a 403 console error on every bookings load (the hourly pg_cron job still needs it SECURITY DEFINER and revoked from anon).
