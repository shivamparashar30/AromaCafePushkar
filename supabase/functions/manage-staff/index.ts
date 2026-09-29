// Edge Function for staff CRUD. Requires an authenticated super_admin caller.
// Uses service_role internally to create/update auth.users entries (which the client SDK can't do).
//
// Actions:
//   create  — new auth.users + profiles row
//   update  — update profile (and optionally auth.users phone/email)
//   reset_pin — change a staff member's PIN
//   toggle_active — activate or deactivate a staff member

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface CreateBody {
  action: "create";
  name: string;
  phone: string;
  role: string;
  pin: string;
  email?: string;
  password?: string;
  assigned_areas?: string[];
}

interface UpdateBody {
  action: "update";
  staff_id: string;
  name?: string;
  phone?: string;
  role?: string;
  assigned_areas?: string[];
}

interface ResetPinBody {
  action: "reset_pin";
  staff_id: string;
  new_pin: string;
}

interface ToggleActiveBody {
  action: "toggle_active";
  staff_id: string;
  is_active: boolean;
}

type RequestBody = CreateBody | UpdateBody | ResetPinBody | ToggleActiveBody;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is authenticated super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Decode caller from JWT via admin.auth.getUser
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: caller },
      error: callerError,
    } = await admin.auth.getUser(token);
    if (callerError || !caller) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }

    // Check caller's role
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("outlet_id, role:roles(name)")
      .eq("id", caller.id)
      .single();

    if (!callerProfile?.role) {
      return jsonResponse({ error: "Caller profile not found" }, 403);
    }

    const callerRole = (callerProfile.role as { name: string }).name;
    if (callerRole !== "super_admin") {
      return jsonResponse({ error: "Only super_admin can manage staff" }, 403);
    }

    const outletId = callerProfile.outlet_id;
    const body = (await req.json()) as RequestBody;

    switch (body.action) {
      case "create":
        return await handleCreate(admin, outletId, body);
      case "update":
        return await handleUpdate(admin, outletId, body);
      case "reset_pin":
        return await handleResetPin(admin, outletId, body);
      case "toggle_active":
        return await handleToggleActive(admin, outletId, body);
      default:
        return jsonResponse({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    console.error("manage-staff error", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});

async function handleCreate(
  admin: ReturnType<typeof createClient>,
  outletId: string,
  body: CreateBody
) {
  const { name, phone, role, pin, email, password, assigned_areas } = body;

  if (!name || !phone || !role || !pin) {
    return jsonResponse(
      { error: "name, phone, role and pin are required" },
      400
    );
  }

  const isOfficeRole = ["super_admin", "manager", "cashier"].includes(role);
  if (isOfficeRole && (!email || !password)) {
    return jsonResponse(
      { error: "email and password required for office roles" },
      400
    );
  }

  // Look up role_id
  const { data: roleRow, error: roleError } = await admin
    .from("roles")
    .select("id")
    .eq("outlet_id", outletId)
    .eq("name", role)
    .single();

  if (roleError || !roleRow) {
    return jsonResponse({ error: "Invalid role" }, 400);
  }

  // Create auth.users entry
  const userPayload: Record<string, unknown> = {
    phone,
    phone_confirm: true,
    user_metadata: {},
  };
  if (isOfficeRole && email && password) {
    userPayload.email = email;
    userPayload.email_confirm = true;
    userPayload.password = password;
  } else {
    // Field roles get a synthetic email (phone@phone.restro.internal) so email-based
    // sign-in works without needing the Phone auth provider enabled
    userPayload.email = phone + "@phone.restro.internal";
    userPayload.email_confirm = true;
    // Field roles get a random password (they use PIN login)
    userPayload.password = crypto.randomUUID() + crypto.randomUUID();
  }

  const { data: authUser, error: authError } =
    await admin.auth.admin.createUser(
      userPayload as Parameters<
        typeof admin.auth.admin.createUser
      >[0]
    );

  if (authError) {
    return jsonResponse({ error: authError.message }, 400);
  }

  // Hash the PIN via RPC
  const { data: pinHash, error: pinError } = await admin.rpc("hash_pin", {
    p_pin: pin,
  });
  if (pinError) {
    return jsonResponse({ error: "Could not hash PIN" }, 500);
  }

  // Create profiles entry
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .insert({
      id: authUser.user.id,
      outlet_id: outletId,
      role_id: roleRow.id,
      name,
      phone,
      pin_hash: pinHash,
      assigned_areas: assigned_areas ?? [],
    })
    .select("id, name, phone, is_active, joining_date")
    .single();

  if (profileError) {
    // Attempt to clean up the auth user if profile insert fails
    await admin.auth.admin.deleteUser(authUser.user.id);
    return jsonResponse({ error: profileError.message }, 400);
  }

  return jsonResponse({ staff: { ...profile, role } });
}

async function handleUpdate(
  admin: ReturnType<typeof createClient>,
  outletId: string,
  body: UpdateBody
) {
  const { staff_id, name, phone, role, assigned_areas } = body;
  if (!staff_id) {
    return jsonResponse({ error: "staff_id is required" }, 400);
  }

  // Verify staff belongs to this outlet
  const { data: existing } = await admin
    .from("profiles")
    .select("id, outlet_id")
    .eq("id", staff_id)
    .single();

  if (!existing || existing.outlet_id !== outletId) {
    return jsonResponse({ error: "Staff not found" }, 404);
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (assigned_areas !== undefined) updates.assigned_areas = assigned_areas;

  if (role) {
    const { data: roleRow } = await admin
      .from("roles")
      .select("id")
      .eq("outlet_id", outletId)
      .eq("name", role)
      .single();
    if (!roleRow) return jsonResponse({ error: "Invalid role" }, 400);
    updates.role_id = roleRow.id;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await admin
      .from("profiles")
      .update(updates)
      .eq("id", staff_id);
    if (error) return jsonResponse({ error: error.message }, 400);
  }

  // Update auth.users phone if changed
  if (phone) {
    const updatePayload: Record<string, unknown> = {
      phone,
      phone_confirm: true,
    };
    // If user has a synthetic email, update it to match the new phone
    const { data: authUser } = await admin.auth.admin.getUserById(staff_id);
    if (authUser?.user?.email?.endsWith("@phone.restro.internal")) {
      updatePayload.email = phone + "@phone.restro.internal";
      updatePayload.email_confirm = true;
    }
    await admin.auth.admin.updateUserById(staff_id, updatePayload);
  }

  return jsonResponse({ ok: true });
}

async function handleResetPin(
  admin: ReturnType<typeof createClient>,
  outletId: string,
  body: ResetPinBody
) {
  const { staff_id, new_pin } = body;
  if (!staff_id || !new_pin) {
    return jsonResponse({ error: "staff_id and new_pin are required" }, 400);
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("outlet_id")
    .eq("id", staff_id)
    .single();
  if (!existing || existing.outlet_id !== outletId) {
    return jsonResponse({ error: "Staff not found" }, 404);
  }

  const { data: pinHash, error: pinError } = await admin.rpc("hash_pin", {
    p_pin: new_pin,
  });
  if (pinError) return jsonResponse({ error: "Could not hash PIN" }, 500);

  const { error } = await admin
    .from("profiles")
    .update({ pin_hash: pinHash })
    .eq("id", staff_id);
  if (error) return jsonResponse({ error: error.message }, 400);

  return jsonResponse({ ok: true });
}

async function handleToggleActive(
  admin: ReturnType<typeof createClient>,
  outletId: string,
  body: ToggleActiveBody
) {
  const { staff_id, is_active } = body;
  if (!staff_id || is_active === undefined) {
    return jsonResponse({ error: "staff_id and is_active are required" }, 400);
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("outlet_id")
    .eq("id", staff_id)
    .single();
  if (!existing || existing.outlet_id !== outletId) {
    return jsonResponse({ error: "Staff not found" }, 404);
  }

  const { error } = await admin
    .from("profiles")
    .update({ is_active })
    .eq("id", staff_id);
  if (error) return jsonResponse({ error: error.message }, 400);

  return jsonResponse({ ok: true });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
