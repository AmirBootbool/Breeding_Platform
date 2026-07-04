FROM python:3.12-slim
WORKDIR /app
ARG REQUIREMENTS_FILE=requirements/prod.txt
COPY requirements/ ./requirements/
RUN pip install --no-cache-dir -r ${REQUIREMENTS_FILE}
COPY . .
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000"]
