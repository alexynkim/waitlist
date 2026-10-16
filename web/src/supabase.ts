import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  throw new Error('.env에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 설정하세요')
}

export const supabase = createClient(url, anonKey)

// Edge Function 주소 (notify)
export const notifyUrl = `${url}/functions/v1/notify`
export const anonKeyHeader = anonKey

/** 대기 entry 타입 (waitlist_entries 테이블과 1:1) */
export interface WaitlistEntry {
  id: string
  phone: string
  name: string | null
  party_size: number
  status: 'waiting' | 'notified' | 'seated' | 'cancelled' | 'no_show'
  marketing_consent: boolean
  notified_at: string | null
  created_at: string
}

/**
 * 캐나다 번호를 E.164(+1...)로 정규화.
 * "604-123-4567" -> "+16041234567"
 */
export function toE164(input: string): string {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 10) return '+1' + digits
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits
  return '+' + digits
}
