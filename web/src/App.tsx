import { useEffect, useState } from "react";
import {
  supabase,
  notifyUrl,
  anonKeyHeader,
  toE164,
  type WaitlistEntry,
} from "./supabase";

/* ---------------- 손님용: 웨이팅 접수 ---------------- */
function JoinForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState<{ position: number } | null>(null);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    const e164 = toE164(phone);
    if (e164.replace(/\D/g, "").length < 11) {
      setError("전화번호를 확인해주세요 (예: 604-123-4567)");
      return;
    }
    // 1. 대기열에 등록
    const { data, error } = await supabase
      .from("waitlist_entries")
      .insert({
        phone: e164,
        name: name || null,
        party_size: partySize,
        marketing_consent: consent,
      })
      .select("id, created_at")
      .single();
    if (error || !data) {
      setError("등록 실패: " + (error?.message ?? ""));
      return;
    }
    // 2. 내 앞에 몇 팀이 있는지 계산
    const { count } = await supabase
      .from("waitlist_entries")
      .select("id", { count: "exact", head: true })
      .eq("status", "waiting")
      .lt("created_at", data.created_at);
    setDone({ position: (count ?? 0) + 1 });
  }

  if (done) {
    return (
      <div className="card">
        <div className="ok">
          접수됐어요! 현재 <b>{done.position}번째</b>로 대기 중이에요.
          <br />
          자리 나면 문자로 알려드릴게요.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>웨이팅 접수</h2>
      <label>이름 (선택)</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="홍길동"
      />
      <label>전화번호 *</label>
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="604-123-4567"
        inputMode="tel"
      />
      <label>인원</label>
      <input
        type="number"
        min={1}
        max={20}
        value={partySize}
        onChange={(e) => setPartySize(Number(e.target.value))}
      />
      <label className="consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          대기 알림 외에 신메뉴·이벤트 소식도 문자로 받겠습니다. (선택,
          미동의해도 웨이팅 이용 가능)
        </span>
      </label>
      <button onClick={submit}>줄 서기</button>
      {error && <div className="err">{error}</div>}
    </div>
  );
}

/* ---------------- 호스트용: 대기열 관리 ---------------- */
const STATUS_LABEL: Record<WaitlistEntry["status"], string> = {
  waiting: "대기 중",
  notified: "알림 발송됨",
  seated: "착석",
  cancelled: "취소",
  no_show: "노쇼",
};

function HostDashboard() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [sending, setSending] = useState<string | null>(null);

  async function fetchEntries() {
    const { data } = await supabase
      .from("waitlist_entries")
      .select("*")
      .order("created_at", { ascending: true });
    setEntries((data as WaitlistEntry[]) ?? []);
  }

  useEffect(() => {
    fetchEntries();
    // 실시간 구독: DB 변경 시 자동 새로고침
    const ch = supabase
      .channel("waitlist")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waitlist_entries" },
        () => fetchEntries(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function setStatus(id: string, status: WaitlistEntry["status"]) {
    await supabase.from("waitlist_entries").update({ status }).eq("id", id);
  }

  // "자리 났어요" 발송 -> Edge Function -> Twilio
  async function notify(entry: WaitlistEntry) {
    setSending(entry.id);
    try {
      const res = await fetch(notifyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKeyHeader,
        },
        body: JSON.stringify({
          entry_id: entry.id,
          message: `[웨이팅] 자리 준비됐어요! 5분 내로 와주세요. (인원 ${entry.party_size}명)`,
        }),
      });
      const json = await res.json();
      if (!json.ok) alert("발송 실패: " + json.error);
    } catch (e) {
      alert("발송 실패: " + String(e));
    } finally {
      setSending(null);
    }
  }

  const active = entries.filter(
    (e) => e.status === "waiting" || e.status === "notified",
  );
  const doneList = entries.filter(
    (e) => !["waiting", "notified"].includes(e.status),
  );

  return (
    <div>
      <h2>대기열 ({active.length}팀)</h2>
      {active.length === 0 && (
        <div className="card">대기 중인 팀이 없어요.</div>
      )}
      {active.map((e, i) => (
        <div className="card" key={e.id}>
          <div className="row">
            <b>
              #{i + 1} {e.name || "(이름 없음)"} · {e.party_size}명
            </b>
            <span className={`badge ${e.status}`}>
              {STATUS_LABEL[e.status]}
            </span>
          </div>
          <div className="meta">
            {e.phone} ·{" "}
            {new Date(e.created_at).toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {e.marketing_consent ? " · 마케팅 동의 ✅" : ""}
          </div>
          <div>
            <button
              className="small"
              disabled={sending === e.id}
              onClick={() => notify(e)}
            >
              {sending === e.id ? "발송 중…" : "자리 났어요 발송"}
            </button>
            <button
              className="small ghost"
              onClick={() => setStatus(e.id, "seated")}
            >
              착석
            </button>
            <button
              className="small ghost"
              onClick={() => setStatus(e.id, "no_show")}
            >
              노쇼
            </button>
            <button
              className="small danger"
              onClick={() => setStatus(e.id, "cancelled")}
            >
              취소
            </button>
          </div>
        </div>
      ))}

      {doneList.length > 0 && (
        <>
          <h2>처리됨 ({doneList.length})</h2>
          {doneList
            .slice(-5)
            .reverse()
            .map((e) => (
              <div className="card" key={e.id}>
                <div className="row">
                  <span>
                    {e.name || "(이름 없음)"} · {e.party_size}명
                  </span>
                  <span className={`badge ${e.status}`}>
                    {STATUS_LABEL[e.status]}
                  </span>
                </div>
              </div>
            ))}
        </>
      )}
    </div>
  );
}

/* ---------------- 앱 ---------------- */
export default function App() {
  const [tab, setTab] = useState<"guest" | "host">("guest");
  return (
    <div className="wrap">
      <h1>🍜 웨이팅 프로토타입</h1>
      <div className="tabs">
        <button
          className={tab === "guest" ? "active" : ""}
          onClick={() => setTab("guest")}
        >
          손님용 (접수)
        </button>
        <button
          className={tab === "host" ? "active" : ""}
          onClick={() => setTab("host")}
        >
          호스트용 (관리)
        </button>
      </div>
      {tab === "guest" ? <JoinForm /> : <HostDashboard />}
    </div>
  );
}
