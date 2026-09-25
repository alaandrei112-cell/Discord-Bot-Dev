---
name: Postgres JSON parameter casts
description: PostgreSQL parameter inference when optional text values are inserted into JSON objects.
---

When a parameter is used only as a value inside `jsonb_build_object`, cast it explicitly to its intended type, such as `parameter::text`.

**Why:** PostgreSQL may report “could not determine data type of parameter” for an otherwise valid prepared query when that placeholder has no typed comparison or column context.

**How to apply:** In raw `pool.query` statements that build JSON from optional strings, cast the text placeholders in both conditional checks and `jsonb_build_object` calls.