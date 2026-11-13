import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { AuthService } from '../core/auth';

/**
 * The gate in front of the whole app.
 *
 * Deliberately the only thing on screen: there is nothing useful to show
 * before sign-in, and a projector pointed at a half-rendered draw stage would
 * give the game away. Credentials come from `environment.ts` - see the note on
 * `AuthService` for what that does and does not protect.
 */
@Component({
  selector: 'app-login-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gate">
      <form class="gate__card card" (submit)="submit($event)" autocomplete="on">
        <div class="card-body d-flex flex-column gap-3">
          <div class="gate__head">
            <span
              class="gate__mark"
              role="img"
              aria-label="SEBS Square 2005, St. Sebastian's College Moratuwa"
            ></span>
            <p class="rd-eyebrow mb-1">SEBS Square 2005</p>
            <h1 class="gate__title mb-1">Raffle <span class="rd-gradient-text">Drawer</span></h1>
            <p class="gate__sub mb-0">Sign in to run the draw.</p>
          </div>

          <div>
            <label class="form-label gate__label" for="gateUser">Username</label>
            <input
              id="gateUser"
              name="username"
              type="text"
              class="form-control"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              autofocus
              [value]="username()"
              (input)="onUsername($event)"
            />
          </div>

          <div>
            <label class="form-label gate__label" for="gatePass">Password</label>
            <div class="input-group">
              <input
                id="gatePass"
                name="password"
                class="form-control"
                [type]="revealed() ? 'text' : 'password'"
                autocomplete="current-password"
                [value]="password()"
                (input)="onPassword($event)"
              />
              <button
                type="button"
                class="btn rd-btn-ghost px-3"
                (click)="revealed.set(!revealed())"
                [title]="revealed() ? 'Hide password' : 'Show password'"
              >
                <svg
                  class="gate__icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" />
                  <circle cx="12" cy="12" r="2.6" />
                  @if (!revealed()) {
                    <path d="m4 20 16-16" />
                  }
                </svg>
                <span class="visually-hidden">{{ revealed() ? 'Hide' : 'Show' }} password</span>
              </button>
            </div>
          </div>

          <!-- Polite, not assertive: the message is read after the field the
               compere is still in, not over the top of their typing. -->
          <p class="gate__error mb-0" role="status" [class.gate__error--on]="error() !== ''">
            {{ error() }}
          </p>

          <button type="submit" class="btn btn-primary w-100 py-2">Sign in</button>
        </div>
      </form>
    </div>
  `,
  styles: `
    .gate {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100dvh;
      padding: 1.5rem;
    }

    .gate__card {
      width: min(24rem, 100%);
      box-shadow: var(--rd-shadow-lg);
    }

    .gate__head {
      text-align: center;
    }

    .gate__mark {
      display: inline-block;
      width: 3.75rem;
      height: 3.75rem;
      margin-bottom: 0.9rem;
      background-image: var(--rd-logo);
      background-size: cover;
      background-position: center;
      border-radius: 1.1rem;
      border: 1px solid var(--rd-line);
      box-shadow: 0 10px 26px -12px rgba(0, 0, 0, 0.9);
    }

    .gate__title {
      font-size: 1.65rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }

    .gate__sub {
      font-size: 0.85rem;
      color: var(--rd-muted);
    }

    .gate__label {
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--rd-faint);
    }

    .gate__icon {
      width: 1.1rem;
      height: 1.1rem;
    }

    /* Height is held whether or not there is a message, so the button does not
       jump out from under the pointer on a failed attempt. */
    .gate__error {
      min-height: 1.2rem;
      font-size: 0.85rem;
      color: var(--bs-danger);
      opacity: 0;
    }

    .gate__error--on {
      opacity: 1;
    }
  `,
})
export class LoginScreen {
  private readonly auth = inject(AuthService);

  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly revealed = signal(false);
  protected readonly error = signal('');

  protected onUsername(event: Event): void {
    this.username.set((event.target as HTMLInputElement).value);
    this.error.set('');
  }

  protected onPassword(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
    this.error.set('');
  }

  protected submit(event: Event): void {
    // Keeps the browser from navigating; the form posts nowhere.
    event.preventDefault();

    if (this.auth.signIn(this.username(), this.password())) {
      // The shell swaps this screen out for the app on the next tick.
      return;
    }

    this.error.set('That username and password do not match.');
    this.password.set('');
  }
}
