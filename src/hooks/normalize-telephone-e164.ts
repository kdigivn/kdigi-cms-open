/**
 * beforeChange hook: normalizes Sites.knowledgeGraph.telephone to E.164 format.
 *
 * ALWAYS recomputes telephoneE164 when telephone is present — Red Team C1.
 * Uses libphonenumber-js for robust parsing with VN as default country.
 */
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import type { CollectionBeforeChangeHook } from 'payload'

export const toE164 = (phone: string, defaultCountry = 'VN' as const): string => {
  const parsed = parsePhoneNumberFromString(phone, defaultCountry)
  if (!parsed?.isValid()) {
    throw new Error(`Invalid phone: ${phone}`)
  }
  return parsed.number // E.164 format: +84901234567
}

/**
 * Hook that runs on every Sites document save.
 * Reads knowledgeGraph.telephone, validates and converts to E.164, then writes
 * telephoneE164. Silently skips if phone is present but invalid — editor can
 * fix phone in admin UI.
 */
export const normalizeTelephoneE164: CollectionBeforeChangeHook = ({ data }) => {
  const phone = data.knowledgeGraph?.telephone
  if (phone) {
    try {
      // ALWAYS recompute — Red Team C1
      data.knowledgeGraph.telephoneE164 = toE164(phone)
    } catch (err) {
      // Log but don't fail the save — editor can fix phone in admin UI
      console.error(`[normalizeTelephoneE164] Invalid phone "${phone}":`, err)
    }
  }
  return data
}
