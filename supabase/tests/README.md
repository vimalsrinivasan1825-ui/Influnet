# SQL flow tests

These run the real migrations against a throwaway Postgres and assert the
behaviour of the SECURITY DEFINER RPCs — the rules that can't be enforced from
the API layer alone (who may accept, who owns a project, what can't be created
twice).

`_harness.sql` stands in for the parts of Supabase the migrations expect:
the `auth` schema, `auth.uid()`, and the `authenticated` / `anon` /
`service_role` roles. Tests set `request.test.uid` to act as a given user.

## Run

```sh
docker run -d --name influnet-migtest -e POSTGRES_PASSWORD=postgres -p 55433:5432 postgres:15
until docker exec influnet-migtest pg_isready -U postgres; do sleep 2; done

docker cp supabase/tests/_harness.sql influnet-migtest:/tmp/
docker cp supabase/migrations influnet-migtest:/tmp/migrations
docker cp supabase/tests/deal_flow_test.sql influnet-migtest:/tmp/

docker exec influnet-migtest psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/_harness.sql
docker exec influnet-migtest bash -c 'cd /tmp/migrations && for f in $(ls *.sql | sort); do psql -U postgres -q -f "$f" >/dev/null 2>&1; done'
docker exec influnet-migtest psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/deal_flow_test.sql

docker rm -f influnet-migtest
```

Migrations that touch `storage.buckets` fail under this harness (that schema is
managed by Supabase and isn't stubbed). That's expected and unrelated to the
flow logic under test.

## Files

- `deal_flow_test.sql` — request → accept → negotiate → propose project →
  bilateral acceptance, plus the decline/renegotiate loop and access control.

- `admin_security_test.sql` — privilege-escalation regression suite for migration
  070. Needs Supabase's default grants replicated before it runs:

  ```sh
  docker exec influnet-migtest psql -U postgres -q -c "
  GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
  REVOKE SELECT ON public.profiles FROM authenticated;
  GRANT SELECT (id, role, name, location, created_at, updated_at) ON public.profiles TO authenticated;
  REVOKE UPDATE ON public.profiles FROM authenticated;
  GRANT UPDATE (name, location, phone, updated_at) ON public.profiles TO authenticated;"
  ```

  Without those grants the harness is *more* restrictive than production and the
  tests pass vacuously.
