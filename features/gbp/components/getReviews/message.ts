/**
 * The message the owner sends, and the phone number it goes to.
 *
 * WHAT THE DEFAULT MESSAGE DELIBERATELY DOES NOT SAY
 * --------------------------------------------------
 * No discount. No free service. No "5 stars". No "if you were happy".
 *
 * Google's review policies prohibit offering anything of value for a review,
 * and prohibit review gating — filtering customers so only the happy ones are
 * asked. A profile caught doing either can have reviews stripped or the
 * listing suspended, which for a shop that lives on Maps traffic is the worst
 * outcome the product can cause. Shoogle ships the default wording precisely so
 * the owner does not have to invent one that gets them banned. The field stays
 * editable — it is their voice — but the safe version is what is already in it.
 *
 * Product rule 12: the UI is English; generated BUSINESS CONTENT may be
 * Hinglish, which is why both defaults exist and the field is editable.
 */

export type MessageTone = 'english' | 'hinglish';

export interface MessageInput {
  /** The business name, when Shoogle actually knows it. Never invented. */
  readonly businessName: string | null;
  readonly url: string;
  readonly tone: MessageTone;
}

/**
 * The default request text.
 *
 * When the business name is unknown the sentence is rewritten rather than
 * padded with a placeholder — "Thanks for visiting !" is worse than a sentence
 * that never needed the name.
 */
export function reviewRequestMessage({ businessName, url, tone }: MessageInput): string {
  const name = businessName === null ? null : businessName.trim() || null;

  if (tone === 'hinglish') {
    const opener =
      name === null
        ? 'Namaste! Aaj aane ke liye dhanyavaad.'
        : `Namaste! Aaj ${name} aane ke liye dhanyavaad.`;
    return `${opener} Agar do minute ho, toh Google par apna imaandar review likh dijiye — isse naye log humein dhoondh paate hain.\n\n${url}`;
  }

  const opener =
    name === null ? 'Thank you for coming in today.' : `Thank you for visiting ${name} today.`;
  return `${opener} If you have two minutes, an honest review on Google helps new customers find us.\n\n${url}`;
}

/* -------------------------------------------------------------------------- */
/* Phone numbers                                                              */
/* -------------------------------------------------------------------------- */

export type PhoneParse =
  | { readonly ok: true; readonly national: string; readonly wa: string }
  /** No number typed. Valid: WhatsApp opens its own contact picker. */
  | { readonly ok: 'blank' }
  | { readonly ok: false; readonly message: string };

/**
 * Normalise an Indian mobile number.
 *
 * Accepts what an owner actually types: `98765 43210`, `+91 98765-43210`,
 * `098765 43210`, `919876543210`. Indian mobile numbers are ten digits
 * beginning 6-9; anything else is rejected with a reason rather than silently
 * handed to WhatsApp, which would open a chat with nobody.
 */
export function parseIndianMobile(raw: string): PhoneParse {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: 'blank' };

  const digits = trimmed.replace(/[^0-9]/g, '');
  if (digits.length === 0) {
    return { ok: false, message: 'Enter a 10-digit mobile number.' };
  }

  let national = digits;
  if (national.length === 12 && national.startsWith('91')) national = national.slice(2);
  else if (national.length === 11 && national.startsWith('0')) national = national.slice(1);

  if (!/^[6-9][0-9]{9}$/.test(national)) {
    return {
      ok: false,
      message: 'That is not an Indian mobile number. It should be 10 digits starting with 6, 7, 8 or 9.',
    };
  }

  return { ok: true, national, wa: `91${national}` };
}

/** `98765 43210`, so the owner can check they typed the right number. */
export function formatNationalMobile(national: string): string {
  return national.length === 10 ? `${national.slice(0, 5)} ${national.slice(5)}` : national;
}
