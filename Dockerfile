FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy

WORKDIR /app

RUN pip install --no-cache-dir uv==0.12.16

COPY pyproject.toml uv.lock README.md ./
COPY src ./src
COPY app ./app
COPY configs ./configs
COPY reports ./reports

RUN uv sync --frozen --no-dev

EXPOSE 8050

CMD ["sh", "-c", "uv run uvicorn app.backend.main:app --host 0.0.0.0 --port ${PORT:-8050}"]
