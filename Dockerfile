# Base image pinned by digest (python:3.15-slim); Dependabot proposes digest updates.
FROM python:3.15-slim@sha256:65a65fc7b30b06cb6df4930fd4650697cb23f4c2698ab81fc87e4b031bc36928

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /opt/fleetkpi
COPY requirements/docker.txt ./requirements.txt
RUN pip install --no-cache-dir --require-hashes --no-deps -r requirements.txt
COPY pyproject.toml README.md LICENSE.md ./
COPY fleetkpi ./fleetkpi
# The project runs from source (its dependencies are installed above, hash-checked), so no unpinned install is needed.
ENV PYTHONPATH=/opt/fleetkpi
RUN printf '#!/bin/sh\nexec python -c "import sys; from fleetkpi.cli import main; sys.exit(main())" "$@"\n' > /usr/local/bin/fleetkpi \
 && chmod +x /usr/local/bin/fleetkpi

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
# Run as an unprivileged user, never root.
RUN useradd --create-home --uid 10001 fleet && mkdir -p /fleet && chown fleet /fleet
USER fleet

# Mount your project folder (fleet.yml + data/input/) here. Empty folder = demo fleet.
WORKDIR /fleet
EXPOSE 8501
ENTRYPOINT ["docker-entrypoint.sh"]
