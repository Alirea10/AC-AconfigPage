# Production deployment

`autochess.alirea.top` is deployed from the Git `master` branch. The server fetches source code from GitHub, builds it, and atomically points Nginx at the resulting commit release. Run the repository test suite locally before pushing the release commit.

After pushing a release commit, deploy it with:

```bash
ssh ubuntu@alirea.top /usr/local/bin/deploy-autochess-config master
```

Each release is stored at:

```text
/www/wwwroot/autochess.alirea.top/releases/<full-commit-sha>/dist
```

The active commit is recorded in `/www/wwwroot/autochess.alirea.top/deployed-commit`. To roll back, point `/www/wwwroot/autochess.alirea.top/current` at a previous release's `dist` directory using the same `current.next` plus `mv -Tf` atomic-link pattern used by `server-deploy.sh`.
