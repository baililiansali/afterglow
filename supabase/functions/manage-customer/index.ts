import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return jsonResponse({ error: "Unauthorized." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = authorization.replace(/^Bearer\s+/i, "");

    const authClient = createClient(supabaseUrl, anonKey);
    const { data: authData, error: authError } =
      await authClient.auth.getUser(token);

    if (authError || !authData.user) {
      return jsonResponse({ error: "Invalid session." }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: adminRole, error: roleError } = await adminClient
      .from("user_roles")
      .select("user_id")
      .eq("user_id", authData.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !adminRole) {
      return jsonResponse({ error: "Admin access required." }, 403);
    }

    const body = await req.json();
    const { action, userId } = body;

    if (!userId || userId === authData.user.id) {
      return jsonResponse(
        { error: "Invalid customer. You cannot manage your own account here." },
        400,
      );
    }

    // Prevent admins from modifying other admin accounts.
    const { data: targetAdmin } = await adminClient
      .from("user_roles")
      .select("user_id")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (targetAdmin) {
      return jsonResponse(
        { error: "Admin accounts cannot be managed from Customers." },
        403,
      );
    }

    if (action === "update_profile") {
      const fullName =
        typeof body.fullName === "string" ? body.fullName.trim() : "";
      const phone =
        typeof body.phone === "string" ? body.phone.trim() : "";

      if (!fullName) {
        return jsonResponse({ error: "Full name is required." }, 400);
      }

      const { error } = await adminClient
        .from("profiles")
        .update({
          full_name: fullName,
          phone: phone || null,
        })
        .eq("id", userId);

      if (error) {
        return jsonResponse({ error: error.message }, 400);
      }

      return jsonResponse({ success: true });
    }

    if (action === "set_active") {
      const isActive = body.isActive;

      if (typeof isActive !== "boolean") {
        return jsonResponse({ error: "Invalid account status." }, 400);
      }

      const { data: profile } = await adminClient
        .from("profiles")
        .select("is_active")
        .eq("id", userId)
        .maybeSingle();

      if (!profile) {
        return jsonResponse({ error: "Customer profile not found." }, 404);
      }

      const { error: profileError } = await adminClient
        .from("profiles")
        .update({ is_active: isActive })
        .eq("id", userId);

      if (profileError) {
        return jsonResponse({ error: profileError.message }, 400);
      }

      // A long ban prevents sign-in. "none" removes the ban.
      const { error: authUpdateError } =
        await adminClient.auth.admin.updateUserById(userId, {
          ban_duration: isActive ? "none" : "876000h",
        });

      if (authUpdateError) {
        // Restore the previous profile status if Auth update fails.
        await adminClient
          .from("profiles")
          .update({ is_active: profile.is_active })
          .eq("id", userId);

        return jsonResponse({ error: authUpdateError.message }, 400);
      }

      return jsonResponse({
        success: true,
        is_active: isActive,
      });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      500,
    );
  }
});