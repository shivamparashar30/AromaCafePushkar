// Verifies phone + PIN on a registered device, then mints a real Supabase Auth session for the
// staff member (Waiter and Kitchen Android apps; also usable by the admin dashboard for phone-based
// staff logins if ever needed). See "Roles and permissions" in the spec.
//
// Session-minting trick: we set a random one-time password on the user via the Admin API, then
// immediately sign in with it via the public password grant. That gives back a session minted by
// GoTrue itself (access_token + refresh_token), so the client SDK's normal session refresh works
// exactly as it would for a password/OTP login -- we just never hand the password to anyone.
//
// Devices are registered on first successful login (see devices table) and can be revoked from the
// admin dashboard's Employee management > Devices screen; a revoked device is rejected here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface LoginBody {
  phone: string;
  pin: string;
  device_identifier: string;
  platform: "android_waiter" | "android_kitchen";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Partial<LoginBody>;
    const { phone, pin, device_identifier, platform } = body;

    if (!phone || !pin || !device_identifier || !platform) {
      return jsonResponse({ error: "phone, pin, device_identifier and platform are required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, outlet_id, pin_hash, is_active")
      .eq("phone", phone)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile || !profile.is_active) {
      return jsonResponse({ error: "Invalid phone or PIN" }, 401);
    }

    const { data: pinOk, error: verifyError } = await admin.rpc("verify_pin", {
      p_hash: profile.pin_hash,
      p_pin: pin,
    });
    if (verifyError) throw verifyError;
    if (!pinOk) {
      return jsonResponse({ error: "Invalid phone or PIN" }, 401);
    }

    const { data: existingDevice, error: deviceLookupError } = await admin
      .from("devices")
      .select("id, revoked_at")
      .eq("user_id", profile.id)
      .eq("device_identifier", device_identifier)
      .maybeSingle();
    if (deviceLookupError) throw deviceLookupError;

    if (existingDevice?.revoked_at) {
      return jsonResponse({ error: "This device has been revoked. Ask an admin to re-approve it." }, 403);
    }

    if (existingDevice) {
      await admin.from("devices").update({ last_seen: new Date().toISOString() }).eq("id", existingDevice.id);
    } else {
      const { error: insertDeviceError } = await admin.from("devices").insert({
        outlet_id: profile.outlet_id,
        user_id: profile.id,
        platform,
        device_identifier,
        last_seen: new Date().toISOString(),
      });
      if (insertDeviceError) throw insertDeviceError;
    }

    const oneTimePassword = crypto.randomUUID() + crypto.randomUUID();
    const { error: passwordError } = await admin.auth.admin.updateUserById(profile.id, {
      password: oneTimePassword,
    });
    if (passwordError) throw passwordError;

    const anon = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({
      phone,
      password: oneTimePassword,
    });
    if (signInError) throw signInError;

    return jsonResponse({
      session: signInData.session,
      user: { id: profile.id, outlet_id: profile.outlet_id },
    });
  } catch (err) {
    console.error("staff-pin-login error", err);
    return jsonResponse({ error: "Login failed" }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
