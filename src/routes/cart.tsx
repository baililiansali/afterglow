import { createFileRoute, redirect } from "@tanstack/react-router";

// The separate cart page was merged into the "Your order" section on the menu.
export const Route = createFileRoute("/cart")({
  beforeLoad: () => {
    throw redirect({ to: "/menu", hash: "order-receipt" });
  },
});
