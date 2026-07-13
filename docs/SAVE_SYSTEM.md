# Save System v0.2

Schema version: 3.

The v3 payload adds scan reports, materialized points of interest, evidence, hypotheses and artifact knowledge. v1 and v2 saves migrate automatically with empty exploration collections, then receive a fresh checksum and backup.

The existing write queue, debounce, checksum validation, rotating backups and automatic recovery remain active.
