FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /opt/fleetkpi
COPY pyproject.toml README.md LICENSE.md ./
COPY fleetkpi ./fleetkpi
RUN pip install --no-cache-dir .

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Mount your project folder (fleet.yml + data/input/) here. Empty folder = demo fleet.
WORKDIR /fleet
EXPOSE 8501
ENTRYPOINT ["docker-entrypoint.sh"]
