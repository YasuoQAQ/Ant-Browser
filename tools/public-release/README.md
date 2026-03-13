Public release tools.

- `publish-public.bat`: one-click publish to public `master`
- `publish-public.ps1`: manual entrypoint

Release snapshot safety:

- replaces `config.yaml` with `publish/config.init.yaml`
- excludes `docs/`, `DEPLOYMENT_GUIDE.md`, `plan.md`, `pic/`, `data/`, `build/bin/`, local IDE folders

Usage:

```bat
tools\public-release\publish-public.bat
```

Behavior:

- public `master` is always published as one aggregated commit
- the script shows console options for publish scope: `master` / `master+release` / `master+tag` / `master+release+tag`
- running the script will publish directly; use `-DryRun` only when you explicitly want a no-push preview
- command line switches are kept only for automation/manual override
