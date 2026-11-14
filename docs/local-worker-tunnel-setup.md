# MEMORA local worker with Lovable Cloud (Windows PowerShell)

## Why the local app has no privileged credential
The hosted Lovable preview/published server gets SUPABASE_SERVICE_ROLE_KEY injected by the platform at runtime.
It is never written to `.env`, GitHub or the repository. A clone running on your PC only has the public `VITE_*`
values from `.env`, so its server functions cannot load the privileged client. This is by design; there is no
supported way to download the managed key, and it must not be copied.

## Supported architecture
```text
Browser ──► Hosted MEMORA (Lovable preview / published, has managed binding)
              │  dispatch (HTTPS + PROCESSING_API_KEY)
              ▼
        HTTPS tunnel ──► Local FastAPI worker 127.0.0.1:8000
              │  callbacks (HTTPS, attempt-bound)
              ▼
        Hosted /api/public/processing and /api/public/processing-artifact
```
- Privileged server functions (claim, callbacks, finalization) run only on the hosted MEMORA server.
- The local `localhost:8080` app can be used for UI work and ordinary signed-in reads; Start processing must be run
  from the hosted preview URL, because server functions are same-origin and cannot borrow the hosted credential.
- The worker never receives the service-role key; it gets private expiring source URLs and a shared worker key.

## Setup commands (PowerShell)
```powershell
# 1. Install the tunnel client
winget install --id Cloudflare.cloudflared -e

# 2. Start the worker (new terminal); same value as the hosted PROCESSING_API_KEY secret
cd memora-platform\processing-service
$env:PROCESSING_API_KEY = Read-Host "Worker key" -MaskInput
$env:PROCESSING_CLOUD_ORIGIN = "https://aszvegtomddywlaljwkx.supabase.co"
$env:PROCESSING_SCRATCH_DIR = "$env:LOCALAPPDATA\memora-scratch"
New-Item -ItemType Directory -Force $env:PROCESSING_SCRATCH_DIR | Out-Null
python -m uvicorn main:app --host 127.0.0.1 --port 8000

# 3. Expose it over HTTPS (another terminal); copy the printed https://….trycloudflare.com URL
cloudflared tunnel --url http://127.0.0.1:8000

# 4. Check the tunnel reaches the worker
Invoke-RestMethod "https://<tunnel-host>/health"
```
Quick-tunnel URLs change on every restart; update PROCESSING_API_URL when that happens (or use a named tunnel).

## Hosted server settings (set in Lovable, never in code)
| Secret | Value |
| --- | --- |
| PROCESSING_API_URL | `https://<tunnel-host>` |
| PROCESSING_API_KEY | shared random worker key (secure form generates it; paste the same value in step 2) |
| PROCESSING_CALLBACK_URL | `https://id-preview--d5ac1397-48e2-46f9-9c3a-3155cf81dc50.lovable.app/api/public/processing` |
| MEMORA_PROCESSING_ENABLED | stays unset until separately approved |

Readiness on the hosted preview will then show the worker as configured; Start stays disabled while the gate is off.
