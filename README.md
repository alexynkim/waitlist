# 웨이팅 프로토타입 (Supabase + Twilio)

손님이 QR/링크로 웨이팅 접수 → 번호가 Supabase에 저장 →
호스트가 "자리 났어요" 버튼 → Twilio로 SMS 발송.
이 한 바퀴가 도는 것을 확인하는 것이 목표.

## 구조

```
손님 폼 (web/) ──insert──▶ Supabase (waitlist_entries 테이블)
호스트 대시보드 (web/) ──호출──▶ Edge Function (notify)
                                      │ Twilio API로 SMS 발송
                                      └── entry 상태 → notified
```

## Phase 0 — 계정 만들기 (Alex가 직접)

1. **Supabase** — https://supabase.com 에서 가입 → 새 프로젝트 생성 (무료 플랜).
   프로젝트 URL과 anon key를 메모. (Dashboard > Project Settings > API)
2. **Twilio** — https://www.twilio.com/try-twilio 에서 trial 가입.
   - trial 번호 하나 발급받기 (Dashboard > Phone Numbers)
   - **내 휴대폰 번호를 Verified Caller ID에 등록** (trial은 인증된 번호에만 발송 가능)

## Phase 1 — DB 테이블 만들기

1. Supabase Dashboard > **SQL Editor** > New query
2. `supabase/schema.sql` 내용을 통째로 붙여넣고 Run.
3. Table Editor에서 `waitlist_entries` 테이블이 생겼는지 확인.

> Realtime 구독도 schema.sql이 자동으로 켜준다.

## Phase 2 — Edge Function 배포 (Twilio 발송 담당)

터미널에서 (Supabase CLI 필요):

```bash
npm install -g supabase
supabase login
supabase link --project-ref <project-ref>   # 대시보드 URL의 앞부분
cd ~/workspace/waitlist-prototype           # (또는 이 폴더를 네 PC로 복사)
supabase functions deploy notify --no-verify-jwt
supabase secrets set \
  TWILIO_ACCOUNT_SID=<twilio sid> \
  TWILIO_AUTH_TOKEN=<twilio auth token> \
  TWILIO_PHONE_NUMBER=+1604xxxxxxx
```

> `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 시크릿은 `supabase link` 후 자동 주입된다.
> Auth token은 절대 프론트엔드 코드에 넣지 않는다. (Edge Function 안에만 존재)

## Phase 3 — 프론트엔드 실행

```bash
cd web
cp .env.example .env
# .env에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 채우기
npm install
npm run dev
```

브라우저에서 http://localhost:5173 접속.

## Phase 4 — 한 바퀴 테스트

1. **손님 탭**: 이름/전화번호(네 인증된 번호)/인원 입력 → "줄 서기".
   → Supabase Table Editor에서 행이 생겼는지 확인.
2. **호스트 탭**: 대기열에 방금 등록이 뜨는지 확인 (실시간).
3. "자리 났어요 발송" 클릭 → 네 휴대폰에 문자 오는지 확인.
   → entry 상태가 `notified`로 바뀌는지 확인.
4. 마케팅 동의 체크박스 켜고 등록 → DB의 `marketing_consent=true` 확인.
   (이게 나중에 "고객 DB"가 된다.)

## 비용 (trial 기준)

- Supabase 무료 플랜으로 충분.
- Twilio trial: 충전 없이 소액 크레딧 제공, 인증된 번호에만 발송.
  trial 문자는 앞에 "Sent from your Twilio trial account" 문구가 붙는다.

## 프로토타입의 한계 (실서비스 전 해결)

- RLS가 anon 전체 허용 — 실제론 호스트 인증 필요.
- 전화번호 중복 체크 없음.
- 발송 실패 재시도 없음.
- "Reply 9 to cancel" 같은 수신 처리는 Twilio webhook 추가 작업.
