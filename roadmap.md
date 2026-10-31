# Roadmap

## Afterglow rebuild (current session)

- [x] Enable Lovable Cloud, email auth, apply zip schema + seed (20 rooms, 9 menu items, 5 categories, settings)
- [x] Rebuild site from zip (pages, Midnight Violet colors, images) — button glow/amber variants restored
- [x] Harden admin booking/order updates (verify affected rows; WITH CHECK on admin update policies)
- [x] Blueprint gaps: admin Reports, Customers, Schedule tabs; /profile page; menu search
- [x] E2E tests passed: rooms+filters (20 rooms, 5 per size), menu search+cart, signup (first user = admin),
      booking with pre-order (totals correct), approve (stuck in DB), check-in, in-room order, order statuses,
      checkout, mark-paid, contact form → admin messages, profile, admin rooms/menu/settings edits (reverted),
      taken-slot greyed out, schedule tab, reset-password feedback
- [x] vitest suite passing (1 test)
- [x] Test account afterglow-e2e@lovabletest.dev deleted with its bookings/orders/messages — admin spot free
- [x] Email auto-confirm restored to OFF (test-only toggle)

## Photos follow-up

- [x] Re-import project into new backend (schema, 20 rooms, 9 menu items, photo fields)
- [x] Home page and cart use uploaded food photos when present
- [ ] Try photo upload in Admin — waiting for the first sign-up (becomes admin)

## Booking & payment follow-up

- [x] 3-step booking (room/time → meals → review & pay) with payment method saved
- [x] Payment method shown on Admin bookings, Schedule and My Bookings
- [ ] Real GCash number and account name — waiting on owner

## Migration into this project

- [x] Database, 20 rooms, 9 menu items, settings, photo storage, hourly no-show cleanup
- [x] All pages, admin dashboard, images and colors copied
- [x] E2E verified on the new backend: signup (first user = admin), customer booking with
      pre-order, approve → check-in → mark-paid lifecycle, contact form → admin messages
- [x] expire_no_show_reservations granted to authenticated (pages call it before listings; fixes 403)
- [x] Test accounts and test data deleted; email confirmation restored to ON
- [ ] Old customers/bookings — waiting for the owner's data export (or skip)
