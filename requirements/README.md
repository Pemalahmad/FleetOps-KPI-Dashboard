# Hash-locked requirements

Every `pip install` in CI and in the Docker image uses these files with `--require-hashes`, so a tampered or
substituted package fails to install. They are generated from `uv.lock`; CI fails if they drift from it.

After changing dependencies (or merging a Dependabot update to `uv.lock`), regenerate both:

```sh
uv export --frozen -q --extra dev --group build --group audit --group lock --no-emit-project --format requirements-txt -o requirements/ci.txt
uv export --frozen -q --no-dev --group build --no-emit-project --format requirements-txt -o requirements/docker.txt
```

| File | Used by |
|---|---|
| `ci.txt` | CI tests, Pages build, release build, dependency audit |
| `docker.txt` | `Dockerfile` (runtime dependencies and the build backend only) |
