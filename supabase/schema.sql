-- ============================================================
-- waitlist-prototype schema
-- Supabase Dashboard > SQL Editor 에 붙여넣고 실행
-- ============================================================

create table waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  phone text not null,                       -- E.164 형식 (+16041234567)
  name text,                                 -- 손님 이름 (선택)
  party_size int not null default 2,         -- 인원
  status text not null default 'waiting'
    check (status in ('waiting','notified','seated','cancelled','no_show')),
  marketing_consent boolean not null default false,  -- 마케팅 수신 동의
  notified_at timestamptz,                   -- "자리 났어요" 발송 시각
  created_at timestamptz not null default now()
);

-- 호스트 대시보드 실시간 갱신용 (Supabase Realtime)
alter publication supabase_realtime add table waitlist_entries;

-- RLS: 프로토타입이라 anon 전체 허용.
-- 실제 서비스 전에는 반드시 정책 강화 (호스트 인증 등)
alter table waitlist_entries enable row level security;

create policy "prototype: anon full access"
  on waitlist_entries for all
  to anon
  using (true)
  with check (true);

-- 자주 쓰는 조회: 대기 중인 팀 순서대로
create index idx_waitlist_status_created
  on waitlist_entries (status, created_at);
