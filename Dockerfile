# Base image pinned by digest (python:3.11-slim); Dependabot proposes digest updates.
FROM python:3.11-slim@sha256:07d4824036af339fa1b6ef769cc99d9c10a141769538b52b3b597c84f7a7b535

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /opt/fleetkpi
COPY requirements/docker.txt ./requirements.txt
RUN pip install --no-cache-dir --require-hashes --no-deps -r requirements.txt
COPY pyproject.toml README.md LICENSE.md ./
COPY fleetkpi ./fleetkpi
RUN pip install --no-cache-dir --no-deps --no-build-isolation .

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
# Run as an unprivileged user, never root.
RUN useradd --create-home --uid 10001 fleet && mkdir -p /fleet && chown fleet /fleet
USER fleet

# Mount your project folder (fleet.yml + data/input/) here. Empty folder = demo fleet.
WORKDIR /fleet
EXPOSE 8501
ENTRYPOINT ["docker-entrypoint.sh"]
