FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

COPY ["FrontEnd 2.0/package.json", "FrontEnd 2.0/package-lock.json", "./"]
RUN npm ci

COPY ["FrontEnd 2.0/", "./"]

ENV NEXT_TELEMETRY_DISABLED=1 \
    ASTRA_STATIC_EXPORT=1

RUN npm run build


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

RUN rm -rf ./app/frontend
COPY --from=frontend-builder /frontend/out ./app/frontend

RUN uv sync --frozen --no-dev

EXPOSE 8050

CMD ["sh", "-c", "uv run uvicorn app.backend.main:app --host 0.0.0.0 --port ${PORT:-8050}"]
