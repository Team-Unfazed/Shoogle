/**
 * Handing a review request to WhatsApp, and copying things to the clipboard.
 *
 * WHY `wa.me` AND NOT `whatsapp://`
 * ---------------------------------
 * `https://wa.me/<number>?text=…` is WhatsApp's own documented link format and
 * is registered as an Android App Link, so with WhatsApp installed the OS hands
 * it straight to the app. With no number it opens WhatsApp's contact picker,
 * which is exactly the "choose a customer" flow Grexa builds a contacts
 * permission for — without asking for the contacts permission.
 *
 * WHY "NOT INSTALLED" IS REPORTED AS A MAYBE
 * -----------------------------------------
 * `openURL` on an https link resolves whether WhatsApp took it or a browser
 * did, so success does not prove WhatsApp opened. `canOpenURL('whatsapp://')`
 * is a better probe, but since Android 11 it returns false unless the app
 * declares a `<queries>` entry for that scheme — which Expo Go does not do on
 * our behalf. So a false probe means "we could not see WhatsApp", NOT "WhatsApp
 * is missing", and the copy says exactly that. Claiming the app is not
 * installed when we cannot tell is the same class of lie as claiming a post was
 * published because HTTP 200 came back.
 */

import { Clipboard } from 'react-native';

export interface LinkingLike {
  openURL(url: string): Promise<unknown>;
  canOpenURL(url: string): Promise<boolean>;
}

export type WhatsAppHandoff =
  | {
      readonly status: 'opened';
      /** False when the probe could not see WhatsApp. Not proof it is missing. */
      readonly whatsappDetected: boolean;
    }
  | { readonly status: 'failed'; readonly message: string };

export interface WhatsAppRequest {
  /** `91XXXXXXXXXX`, or null to let WhatsApp ask the owner who to send it to. */
  readonly waNumber: string | null;
  readonly text: string;
}

export function whatsAppUrl({ waNumber, text }: WhatsAppRequest): string {
  const query = `?text=${encodeURIComponent(text)}`;
  return waNumber === null ? `https://wa.me/${query}` : `https://wa.me/${waNumber}${query}`;
}

const HANDOFF_FAILED =
  'WhatsApp did not open. It may not be installed on this phone. Copy the message and send it however you normally would.';

export async function openWhatsApp(
  linking: LinkingLike,
  request: WhatsAppRequest,
): Promise<WhatsAppHandoff> {
  let whatsappDetected = false;
  try {
    whatsappDetected = await linking.canOpenURL('whatsapp://send');
  } catch {
    whatsappDetected = false;
  }

  try {
    await linking.openURL(whatsAppUrl(request));
    return { status: 'opened', whatsappDetected };
  } catch {
    return { status: 'failed', message: HANDOFF_FAILED };
  }
}

/* -------------------------------------------------------------------------- */
/* Clipboard                                                                  */
/* -------------------------------------------------------------------------- */

export interface ClipboardLike {
  setString(value: string): void;
}

/**
 * React Native's own clipboard module.
 *
 * `expo-clipboard` is not a dependency of this project and the brief was
 * explicit about not adding one, so this uses the clipboard that ships inside
 * react-native. It is marked deprecated upstream — accessing it logs a
 * one-time warning — which is why the access is lazy and confined to this
 * function: the day `expo-clipboard` is added, one line changes.
 */
export function resolveClipboard(): ClipboardLike | null {
  const candidate: ClipboardLike | undefined = Clipboard;
  if (candidate === undefined || typeof candidate.setString !== 'function') return null;
  return candidate;
}

export type CopyOutcome = { readonly ok: true } | { readonly ok: false; readonly message: string };

const COPY_UNAVAILABLE =
  'This phone did not let Shoogle use the clipboard. Select the link above and copy it by hand.';

/** Copies, and reports honestly when the platform refused. Never a silent no-op. */
export function copyToClipboard(value: string, clipboard = resolveClipboard()): CopyOutcome {
  if (clipboard === null) return { ok: false, message: COPY_UNAVAILABLE };
  try {
    clipboard.setString(value);
    return { ok: true };
  } catch {
    return { ok: false, message: COPY_UNAVAILABLE };
  }
}
