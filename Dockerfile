# ---- Build stage ----
FROM python:3.12-slim AS base

# Prevent Python from buffering stdout/stderr (useful for Docker logs)
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create data directory for results persistence
RUN mkdir -p /app/data

# Expose the server port
EXPOSE 8080

# Health check — verify the server is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/')" || exit 1

# Run the server
CMD ["python", "server.py"]
