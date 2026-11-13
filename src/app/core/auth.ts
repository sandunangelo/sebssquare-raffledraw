import { computed, Injectable, signal } from '@angular/core';

import { environment } from '../../environments/environment';

/** One sign-in, exactly as configured in `environment.ts`. */
export interface Credential {
  readonly username: string;
  readonly password: string;
  /** Shown in the header once signed in. Falls back to the username. */
  readonly displayName?: string;
}

export interface SignedInUser {
  readonly username: string;
  readonly displayName: string;
}

/**
 * The sign-in gate.
 *
 * Worth being plain about what this is. The app is a static bundle with no
 * backend of its own, so the credentials in `environment.ts` are shipped to
 * every visitor inside the JavaScript and anyone who opens the sources can
 * read them. This stops the draw being *walked into* by whoever has the link;
 * it is not a security boundary. Nothing that must genuinely stay secret
 * should be put behind it - and the entry list it guards is a link-shared
 * Google Sheet anyway.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly accounts = configuredAccounts();

  /**
   * With no credentials configured the gate stays open rather than locking
   * everyone out: an empty list is far more likely to be an oversight than a
   * deliberate lockdown, and being shut out mid-event is the worse failure.
   */
  readonly enabled = this.accounts.length > 0;

  private readonly _user = signal<SignedInUser | null>(null);
  readonly user = this._user.asReadonly();

  readonly signedIn = computed(() => !this.enabled || this._user() !== null);

  constructor() {
    this.restore();
  }

  /** True when the pair matched. The caller owns the error message. */
  signIn(username: string, password: string): boolean {
    const wanted = username.trim().toLowerCase();
    const account = this.accounts.find(
      (candidate) => candidate.username === wanted && candidate.password === password,
    );
    if (!account) {
      return false;
    }

    this._user.set(toUser(account));
    this.persist(account.username);
    return true;
  }

  signOut(): void {
    this._user.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable; the signed-out state still holds in memory.
    }
  }

  // ---------------------------------------------------------------------------
  //  Persistence - an accidental refresh mid-event must not ask again
  // ---------------------------------------------------------------------------

  private persist(username: string): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: STORAGE_VERSION,
          username,
          expiresAt: Date.now() + SESSION_MS,
        }),
      );
    } catch {
      // The sign-in still holds for this page load.
    }
  }

  private restore(): void {
    if (!this.enabled) {
      return;
    }

    let parsed: unknown;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        return;
      }
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return;
    }
    const saved = parsed as Record<string, unknown>;
    if (saved['version'] !== STORAGE_VERSION) {
      return;
    }

    const expiresAt = saved['expiresAt'];
    if (typeof expiresAt !== 'number' || expiresAt <= Date.now()) {
      return;
    }

    // Matched against the live list, so deleting a credential from
    // environment.ts also ends every session it had already handed out.
    const account = this.accounts.find((candidate) => candidate.username === saved['username']);
    if (!account) {
      return;
    }

    this._user.set(toUser(account));
  }
}

const STORAGE_KEY = 'raffle-drawer.session';
const STORAGE_VERSION = 1;

/** A sign-in lasts this long. Long enough to cover a whole event night. */
const SESSION_MS = Math.max(0.25, environment.auth?.sessionHours ?? 12) * 60 * 60 * 1000;

/**
 * Usernames are folded to lower case here and at the point of comparison, so
 * the compere typing `Admin` into the form still gets in. Passwords are
 * compared exactly, as typed.
 */
function configuredAccounts(): readonly Credential[] {
  const configured: readonly Credential[] = environment.auth?.credentials ?? [];
  return configured
    .map((account) => ({
      username: String(account.username ?? '')
        .trim()
        .toLowerCase(),
      password: String(account.password ?? ''),
      displayName: account.displayName?.trim(),
    }))
    .filter((account) => account.username !== '' && account.password !== '');
}

function toUser(account: Credential): SignedInUser {
  return {
    username: account.username,
    displayName:
      account.displayName !== undefined && account.displayName !== ''
        ? account.displayName
        : account.username,
  };
}
