import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Server configuration is incomplete." }, 500);
    }

    const token = authorization.replace(/^Bearer\s+/i, "");

    const authClient = createClient(supabaseUrl, anonKey);

    const { data: authData, error: authError } = await authClient.auth.getUser(token);

    if (authError || !authData.user) {
      return jsonResponse({ error: "Invalid session." }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Only admins may manage staff accounts.
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
    const action = body?.action;

    // CREATE STAFF ACCOUNT
    if (action === "create_staff") {
      const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const phone = typeof body.phone === "string" ? body.phone.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";

      if (!fullName || fullName.length > 120) {
        return jsonResponse({ error: "Enter a valid full name (maximum 120 characters)." }, 400);
      }

      if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse({ error: "Enter a valid email address." }, 400);
      }

      if (password.length < 8 || password.length > 128) {
        return jsonResponse({ error: "Password must be between 8 and 128 characters." }, 400);
      }

      if (phone.length > 30) {
        return jsonResponse({ error: "Phone number is too long." }, 400);
      }

      // The auth.users trigger creates the profile and default customer role.
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
        },
      });

      if (createError || !created.user) {
        return jsonResponse(
          { error: createError?.message ?? "Unable to create the staff account." },
          400,
        );
      }

      const newUserId = created.user.id;

      // The trigger should have created this profile already.
      const { data: profile, error: profileLookupError } = await adminClient
        .from("profiles")
        .select("id")
        .eq("id", newUserId)
        .maybeSingle();

      if (profileLookupError || !profile) {
        await adminClient.auth.admin.deleteUser(newUserId);

        return jsonResponse(
          { error: "The new account profile could not be created. The account was rolled back." },
          500,
        );
      }

      const { error: profileUpdateError } = await adminClient
        .from("profiles")
        .update({
          full_name: fullName,
          phone: phone || null,
        })
        .eq("id", newUserId);

      if (profileUpdateError) {
        await adminClient.auth.admin.deleteUser(newUserId);

        return jsonResponse(
          { error: "Unable to save staff details. The account was rolled back." },
          500,
        );
      }

      // Assign staff first, then remove the trigger-created customer role.
      const { error: staffRoleError } = await adminClient.from("user_roles").insert({
        user_id: newUserId,
        role: "staff",
      });

      if (staffRoleError) {
        await adminClient.auth.admin.deleteUser(newUserId);

        return jsonResponse(
          { error: "Unable to assign the staff role. The account was rolled back." },
          500,
        );
      }

      const { error: customerRoleError } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", newUserId)
        .eq("role", "customer");

      if (customerRoleError) {
        await adminClient.auth.admin.deleteUser(newUserId);

        return jsonResponse(
          { error: "Unable to finalize the staff role. The account was rolled back." },
          500,
        );
      }

      return jsonResponse({
        success: true,
        userId: newUserId,
        message: "Staff account created successfully.",
      });
    }

    // All remaining actions require an existing staff account.
    const userId = body?.userId;

    if (typeof userId !== "string" || !userId) {
      return jsonResponse({ error: "Invalid staff account." }, 400);
    }

    if (userId === authData.user.id) {
      return jsonResponse({ error: "You cannot manage your own account here." }, 400);
    }

    const { data: staffRole, error: staffRoleLookupError } = await adminClient
      .from("user_roles")
      .select("user_id")
      .eq("user_id", userId)
      .eq("role", "staff")
      .maybeSingle();

    if (staffRoleLookupError) {
      return jsonResponse({ error: "Unable to verify the staff account." }, 500);
    }

    if (!staffRole) {
      return jsonResponse({ error: "Staff account not found." }, 404);
    }

    const { data: staffProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, is_active")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      return jsonResponse({ error: profileError.message }, 500);
    }

    if (!staffProfile) {
      return jsonResponse({ error: "Staff profile not found." }, 404);
    }

    // UPDATE STAFF PROFILE
    if (action === "update_profile") {
      const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
      const phone = typeof body.phone === "string" ? body.phone.trim() : "";

      if (!fullName || fullName.length > 120) {
        return jsonResponse({ error: "Enter a valid full name." }, 400);
      }

      if (phone.length > 30) {
        return jsonResponse({ error: "Phone number is too long." }, 400);
      }

      const { error: updateError } = await adminClient
        .from("profiles")
        .update({
          full_name: fullName,
          phone: phone || null,
        })
        .eq("id", userId);

      if (updateError) {
        return jsonResponse({ error: updateError.message }, 400);
      }

      // Keep the Auth user metadata in sync with the profile name.
      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: {
          full_name: fullName,
        },
      });

      if (authUpdateError) {
        return jsonResponse(
          { error: "Profile updated, but Auth metadata could not be synchronized." },
          400,
        );
      }

      return jsonResponse({ success: true });
    }

    // ACTIVATE OR DEACTIVATE STAFF
    if (action === "set_active") {
      const isActive = body.isActive;

      if (typeof isActive !== "boolean") {
        return jsonResponse({ error: "Invalid account status." }, 400);
      }

      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, {
        ban_duration: isActive ? "none" : "876000h",
      });

      if (authUpdateError) {
        return jsonResponse({ error: authUpdateError.message }, 400);
      }

      const { error: profileUpdateError } = await adminClient
        .from("profiles")
        .update({ is_active: isActive })
        .eq("id", userId);

      if (profileUpdateError) {
        // Restore the previous Auth ban state if the profile update fails.
        await adminClient.auth.admin.updateUserById(userId, {
          ban_duration: staffProfile.is_active === false ? "876000h" : "none",
        });

        return jsonResponse({ error: profileUpdateError.message }, 400);
      }

      return jsonResponse({
        success: true,
        is_active: isActive,
      });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Unexpected error.",
      },
      500,
    );
  }
});
