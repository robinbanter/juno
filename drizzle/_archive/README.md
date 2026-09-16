# Archived migration history

These are the migrations from before the project adopted `drizzle-kit migrate`.

They were never applied by drizzle: the `__drizzle_migrations` bookkeeping table
did not exist, meaning the live schema was built entirely with `drizzle-kit push`
and these files were only ever a partial record of it. The journal proved it —
`0007_call_sessions` and `0008_call_message_kind` existed as SQL but were absent
from `_journal.json`, two files collided on the `0007` prefix, and snapshots for
0002/0006/0007 were missing, so `generate` could not have produced a correct diff.

Kept for history. Do not apply them; the schema they describe is superseded by
the baseline in the parent directory.
