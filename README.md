# memora

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d5ac1397-48e2-46f9-9c3a-3155cf81dc50).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Local account access

Use the downloaded project's existing `.env` values; do not create another Cloud project or edit generated integration files. Browser sign-in needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; keep `VITE_SUPABASE_PROJECT_ID` from the export. Server functions also use `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_PROJECT_ID`. Never add private keys with a `VITE_` prefix.

Email/password requests use the same Lovable Cloud account service locally and hosted. An account created with Google does not necessarily have a password. Use **Forgot password** with that account's email to set one yourself; do not register a replacement account. The audit found both existing accounts had no password set. No account password was changed by this fix.

Google and Lovable sign-in use a hosted broker at `/~oauth/initiate`, which Vite does not serve. Their buttons are disabled on loopback hosts; the hosted helper remains unchanged. Do not replace it with raw provider OAuth or proxy tokens through another origin.

For recovery links to return to local development, open the app at `http://127.0.0.1:<port>` and add `http://127.0.0.1:<port>/**` under **More → Users → Auth settings → Advanced → Redirect URLs**. The audited allow-list has hosted URLs only. Without that addition, recovery links fall back to hosted MEMORA; you can set the password there and then sign in locally. Do not change the hosted Site URL. Sessions use localStorage outside the hosted preview and survive refresh.
