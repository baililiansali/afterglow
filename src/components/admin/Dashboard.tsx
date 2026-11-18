import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Wallet, TrendingUp, Receipt } from "lucide-react";
import type { ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { fmtDate, peso } from "@/lib/afterglow";
import { useAuth } from "@/lib/auth";
import { useMyProfile } from "@/lib/avatar";
import { calculateCollectedRevenue } from "@/lib/revenue";
import type { SectionKey } from "./AdminShell";
import type { OrderRow, ResRow } from "./shared";

type FinancialDay = {
  date: string;
  label: string;
  value: number;
};

type ExpenseRow = {
  category: string;
  amount: number | string;
  expense_date: string;
};

function getLastSevenDays(today: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (6 - index));

    const dateKey = date.toISOString().slice(0, 10);

    return {
      date: dateKey,
      label: new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-PH", {
        weekday: "short",
      }),
    };
  });
}

function FinancialChart({
  title,
  description,
  data,
  variant,
}: {
  title: string;
  description: string;
  data: FinancialDay[];
  variant: "revenue" | "profit";
}) {
  const maxValue = Math.max(1, ...data.map((item) => Math.abs(item.value)));
  const isProfit = variant === "profit";

  return (
    <Panel title={title}>
      <p className="mb-5 text-xs text-muted-foreground">{description}</p>

      <div className="grid grid-cols-7 gap-2">
        {data.map((item) => {
          const isNegative = item.value < 0;

          const height = Math.max(
            item.value === 0 ? 0 : 4,
            (Math.abs(item.value) / maxValue) * (isProfit ? 42 : 100),
          );

          const barColor = isProfit ? (isNegative ? "bg-destructive" : "bg-glow") : "bg-primary";

          return (
            <div key={item.date} className="flex min-w-0 flex-col items-center gap-2">
              <span
                className={`w-full truncate text-center text-[10px] font-medium ${
                  isProfit && isNegative
                    ? "text-destructive"
                    : isProfit
                      ? "text-glow"
                      : "text-primary"
                }`}
                title={peso(item.value)}
              >
                {peso(item.value)}
              </span>

              {isProfit ? (
                <div className="relative h-32 w-full">
                  <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-border" />

                  {item.value !== 0 && (
                    <div
                      className={`absolute left-1/2 w-3/5 -translate-x-1/2 rounded-sm ${barColor}`}
                      style={
                        isNegative
                          ? {
                              top: "50%",
                              height: `${height}%`,
                            }
                          : {
                              bottom: "50%",
                              height: `${height}%`,
                            }
                      }
                    />
                  )}
                </div>
              ) : (
                <div className="flex h-32 w-full items-end justify-center">
                  <div
                    className={`w-3/5 rounded-t-md ${barColor}`}
                    style={{
                      height: `${height}%`,
                      minHeight: item.value > 0 ? 4 : 0,
                    }}
                  />
                </div>
              )}

              <span className="text-[10px] text-muted-foreground">{item.label}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span className={`h-2.5 w-2.5 rounded-sm ${isProfit ? "bg-glow" : "bg-primary"}`} />
        {isProfit ? "Daily profit" : "Daily collected revenue"}

        {isProfit && (
          <>
            <span className="ml-3 h-2.5 w-2.5 rounded-sm bg-destructive" />
            Negative profit
          </>
        )}
      </div>
    </Panel>
  );
}

function RevenueBreakdownChart({
  roomRevenue,
  foodRevenue,
}: {
  roomRevenue: number;
  foodRevenue: number;
}) {
  const total = roomRevenue + foodRevenue;

  const roomPercentage = total > 0 ? (roomRevenue / total) * 100 : 0;
  const foodPercentage = total > 0 ? (foodRevenue / total) * 100 : 0;

  const chartBackground =
    total > 0
      ? `conic-gradient(#A78BFA 0% ${roomPercentage}%, #F59E0B ${roomPercentage}% 100%)`
      : "conic-gradient(hsl(var(--muted)) 0% 100%)";

  return (
    <Panel title="Revenue Breakdown">
      <p className="mb-5 text-xs text-muted-foreground">
        Collected revenue from room reservations and food orders.
      </p>

      <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-around">
        {/* Doughnut chart */}
        <div className="relative h-48 w-48 shrink-0">
          <div className="h-full w-full rounded-full" style={{ background: chartBackground }} />

          <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-card">
            <span className="text-[10px] text-muted-foreground">Total Collected</span>
            <span className="mt-1 text-center font-display text-lg font-bold">{peso(total)}</span>
          </div>
        </div>

        {/* Revenue details */}
        <div className="w-full space-y-5 sm:max-w-[220px]">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-sm bg-[#A78BFA]" />
                <span className="text-sm font-medium">Room Revenue</span>
              </div>

              <span className="text-xs text-muted-foreground">{roomPercentage.toFixed(1)}%</span>
            </div>

            <p className="text-xl font-bold">{peso(roomRevenue)}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-[#A78BFA]"
                style={{ width: `${roomPercentage}%` }}
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-sm bg-[#F59E0B]" />
                <span className="text-sm font-medium">Food Revenue</span>
              </div>

              <span className="text-xs text-muted-foreground">{foodPercentage.toFixed(1)}%</span>
            </div>

            <p className="text-xl font-bold">{peso(foodRevenue)}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-[#F59E0B]"
                style={{ width: `${foodPercentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function Dashboard({
  res,
  orders,
  onSection,
}: {
  res: ResRow[];
  orders: OrderRow[];
  onSection: (s: SectionKey) => void;
}) {
  const { user } = useAuth();

  const profile = useMyProfile(user?.id) as unknown as
    { data?: { full_name?: string | null } } | undefined;

  // Manila local date (UTC+8).
  const manila = new Date(Date.now() + 8 * 3600 * 1000).toISOString();
  const today = manila.slice(0, 10);

  // Fetch saved business expenses for financial calculations.
  const { data: expenses = [] } = useQuery({
    queryKey: ["admin-expenses"],
    queryFn: async (): Promise<ExpenseRow[]> => {
      const { data, error } = await supabase
        .from("business_expenses")
        .select("category, amount, expense_date")
        .order("expense_date", { ascending: false });

      if (error) throw error;

      return (data ?? []) as ExpenseRow[];
    },
  });

  const todayRevenue = calculateCollectedRevenue(
    res.filter((reservation) => reservation.booking_date === today),
    orders.filter((order) => order.reservations?.booking_date === today),
  ).totalRevenue;
  const totalRevenue = calculateCollectedRevenue(res, orders);
  const totalCollected = totalRevenue.totalRevenue;

  // Only Salary, Maintenance, and Damages count toward dashboard expenses.
  const includedExpenses = expenses.filter(
    (expense) =>
      expense.category === "salary" ||
      expense.category === "maintenance" ||
      expense.category === "damage",
  );

  const totalExpenses = includedExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

  // Total profit = total collected - included expenses.
  const totalProfit = totalCollected - totalExpenses;

  // Last seven days for financial charts.
  const chartDays = getLastSevenDays(today);

  // Daily collected revenue from paid room reservations and food orders.
  const revenueTrend: FinancialDay[] = chartDays.map((day) => {
    const revenue = calculateCollectedRevenue(
      res.filter((reservation) => reservation.booking_date === day.date),
      orders.filter((order) => order.reservations?.booking_date === day.date),
    );

    return {
      date: day.date,
      label: day.label,
      value: revenue.totalRevenue,
    };
  });

  // Daily profit = daily collected revenue - Salary, Maintenance, and Damages.
  const profitTrend: FinancialDay[] = chartDays.map((day, index) => {
    const dailyExpenses = expenses
      .filter(
        (expense) =>
          expense.expense_date === day.date &&
          ["salary", "maintenance", "damage"].includes(expense.category),
      )
      .reduce((sum, expense) => sum + Number(expense.amount), 0);

    return {
      date: day.date,
      label: day.label,
      value: revenueTrend[index].value - dailyExpenses,
    };
  });

  // Reservation activity for the last seven days.
  const days = chartDays.map((day) => ({
    d: day.date,
    n: res.filter((r) => r.booking_date === day.date).length,
  }));

  const maxDay = Math.max(1, ...days.map((x) => x.n));

  const firstName =
    (profile?.data?.full_name ?? "").split(" ")[0] || user?.email?.split("@")[0] || "there";

  const stats = [
    {
      l: "Today's Revenue",
      v: peso(todayRevenue),
      sub: "Payments collected today",
      icon: Wallet,
      tone: "text-accent",
    },
    {
      l: "Total Collected",
      v: peso(totalCollected),
      sub: "Room revenue + food revenue",
      icon: Wallet,
      tone: "text-primary",
    },
    {
      l: "Total Expenses",
      v: peso(totalExpenses),
      sub: "Salary, maintenance and damages",
      icon: Receipt,
      tone: "text-destructive",
    },
    {
      l: "Total Profit",
      v: peso(totalProfit),
      sub: "Total collected minus expenses",
      icon: TrendingUp,
      tone: totalProfit >= 0 ? "text-glow" : "text-destructive",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Dashboard heading */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl font-bold">Hello, {firstName}</h2>

          <p className="text-sm text-muted-foreground">
            Here's what's happening at SONARA right now.
          </p>
        </div>

        <span className="rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground">
          {fmtDate(today)}
        </span>
      </div>

      {/* Financial summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.l} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">{s.l}</p>

              <span className={`rounded-lg bg-secondary p-1.5 ${s.tone}`}>
                <s.icon className="h-4 w-4" />
              </span>
            </div>

            <p className="mt-3 font-display text-2xl font-bold">{s.v}</p>

            <p className={`mt-1 text-xs ${s.tone}`}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Revenue breakdown */}
      <RevenueBreakdownChart
        roomRevenue={totalRevenue.roomRevenue}
        foodRevenue={totalRevenue.foodRevenue}
      />

      {/* Financial and reservation charts */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Left column: Revenue and Profit charts */}
        <div className="grid content-start gap-6">
          <FinancialChart
            title="Revenue Trend · last 7 days"
            description="Daily collected revenue from paid room reservations and food orders."
            data={revenueTrend}
            variant="revenue"
          />

          <FinancialChart
            title="Profit Trend · last 7 days"
            description="Daily collected revenue minus Salary, Maintenance, and Damages recorded for each day."
            data={profitTrend}
            variant="profit"
          />
        </div>

        {/* Right column: Reservations and Transactions */}
        <div className="grid content-start gap-6">
          <Panel
            title="Reservations · last 7 days"
            action={() => onSection("reports")}
            actionLabel="Reports"
          >
            <div className="flex h-48 items-end gap-2">
              {days.map((x) => (
                <div key={x.d} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs font-semibold">{x.n}</span>

                  <div
                    className="w-full rounded-t-md bg-primary"
                    style={{
                      height: `${(x.n / maxDay) * 100}%`,
                      minHeight: 4,
                    }}
                  />

                  <span className="text-[10px] text-muted-foreground">
                    {new Date(`${x.d}T00:00:00`).toLocaleDateString("en-US", {
                      weekday: "short",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          {/* Transactions shortcut */}
          <Panel title="Transactions">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
              <div className="rounded-lg bg-secondary p-2 text-primary">
                <Receipt className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Manage transactions</p>

                <p className="text-xs text-muted-foreground">
                  View payments and financial records.
                </p>
              </div>
            </div>

            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={() => onSection("payments")}
            >
              Go to Transactions
              <ArrowRight className="h-4 w-4" />
            </button>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
  action,
  actionLabel,
}: {
  title: string;
  children: ReactNode;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">{title}</h3>

        {action && (
          <button
            type="button"
            onClick={action}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {actionLabel}
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="space-y-2">{children}</div>
    </section>
  );
}
