-- Prevent duplicate pending cleanup jobs for the same object key.
CREATE UNIQUE INDEX uq_storage_cleanup_pending_object_key
    ON storage_cleanup_jobs (storage_cleanup_object_key)
    WHERE storage_cleanup_completed_at IS NULL;
