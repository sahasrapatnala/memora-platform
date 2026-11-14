# MEMORA processing MVP rollout — review required

No SQL in this directory has been applied by this implementation pass. The live migration journal remains unchanged. Do not enable `MEMORA_PROCESSING_ENABLED` or `MEMORA_RETENTION_ENABLED` until the corresponding migration and acceptance checks complete.

## Execution order

1. **Review and apply `dispatch-v3.sql`** through the Lovable migration tool. It adds selected-job claims, reviewer revalidation, three-attempt leases, heartbeats, fencing tokens and temporary fail-closed ingestion guards.
2. **Review and apply `processing-ingestion-v4.sql`** in the next migration. It adds attempt-bound output lineage, private artifact receipts, verified manifests, idempotent finalization and knowledge ingestion. It replaces the temporary guard bodies with transaction-local verified controls; it does not remove RLS or permit browser writes. It preserves existing rows while allowing separate result sets for multiple processing jobs of one original.
3. Regenerate database types. Replace the isolated untyped RPC adapters with generated RPC types before removing the feature gates.
4. Deploy the independent Python service with its own scratch disk, FFmpeg, Faster-Whisper and the environment names in its README. The worker receives no Cloud service-role credential.
5. Configure the application server's `PROCESSING_API_URL`, `PROCESSING_API_KEY`, `PROCESSING_CALLBACK_URL` and `PROCESSING_CALLBACK_ORIGIN`. Use the same private shared value on the worker; never expose it through a `VITE_` variable.
6. Test dispatch with one short approved MP4: concurrent selected-job claim, revoked reviewer, expired lease, stale token, third-attempt exhaustion, frame receipt verification, finalization and refresh persistence. Only then set `MEMORA_PROCESSING_ENABLED=true`.
7. **Review and apply `duplicate-retention-v5.sql`**. Run exact/near analysis, validate measured savings and reviewer-only retention decisions. Verify a retained original's bytes and SHA-256, owner confirmation, active-job exclusion, deletion failure recovery and historical reclaimed accounting before setting `MEMORA_RETENTION_ENABLED=true`.
8. **Review and apply `offboarding-v6.sql`**. Create an inventory, select files, run the shared duplicate analysis, verify unique-file preservation and confirm that no deletion is authorized by an offboarding case.

## Rollback and failure behavior

Each SQL file uses transaction-compatible DDL. A schema incompatibility or rejected statement rolls back that migration submission. Applied earlier migrations are not rewritten. Dispatch remains fail closed if ingestion is absent. Output guards remain if a later migration fails. Original files and Storage objects are never migration inputs.

## Known implementation bounds

- Processing manifests are limited to 8 MiB; JPEG frames and thumbnails are limited to 2 MiB each, with at most 60 frames per attempt.
- Duplicate analysis currently refuses workspaces with more than 500 extracted pages or 500 slides rather than saving a partial analysis. Batched analysis remains future work.
- Speaker attribution is marked unavailable unless a real diarization implementation supplies it. No speaker identity is inferred.
- PDF pages without text are preserved and marked OCR-required. OCR is not falsely reported as completed.
- Private Storage uploads cannot be atomically fenced by PostgreSQL. Attempt-prefixed artifacts can become orphaned after expiry, but stale workers cannot register, ingest or finalize them. Orphan cleanup must verify attempt status before removing generated staging objects only.
