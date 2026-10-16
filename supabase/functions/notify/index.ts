// ============================================================
// Supabase Edge Function: notify
// "자리 났어요" SMS를 Twilio로 발송하고, 해당 entry를 notified 처리.
//
// 배포:
//   supabase functions deploy notify --no-verify-jwt
// 시크릿 등록 (대시보드 또는 CLI):
//   supabase secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... \
//     TWILIO_PHONE_NUMBER=+1604xxxxxxx
// 호출:
//   POST https://<project-ref>.supabase.co/functions/v1/notify
//   body: { "entry_id": "<uuid>", "message": "자리 준비됐어요!" }
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { entry_id, message } = await req.json();
    if (!entry_id || !message) {
      throw new Error("entry_id와 message가 필요합니다");
    }

    // 1. DB에서 수신자 번호 조회 (service_role: RLS 우회)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: entry, error: fetchErr } = await supabase
      .from("waitlist_entries")
      .select("phone")
      .eq("id", entry_id)
      .single();
    if (fetchErr || !entry) throw new Error("대기 entry를 찾을 수 없습니다");

    // 2. Twilio로 SMS 발송
    const sid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
    const token = Deno.env.get("TWILIO_AUTH_TOKEN")!;
    const from = Deno.env.get("TWILIO_PHONE_NUMBER")!;

    const params = new URLSearchParams({
      To: entry.phone,
      From: from,
      Body: message,
    });
    const smsRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          // Twilio는 AccountSID:AuthToken 을 Basic 인증으로 받는다
          "Authorization": "Basic " + btoa(`${sid}:${token}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      },
    );
    if (!smsRes.ok) {
      throw new Error("Twilio 발송 실패: " + (await smsRes.text()));
    }

    // 3. entry 상태를 notified로 변경
    await supabase
      .from("waitlist_entries")
      .update({ status: "notified", notified_at: new Date().toISOString() })
      .eq("id", entry_id);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
