# Use the official Python slim image for a smaller container size
FROM python:3.11-slim

# Set the working directory inside the container
WORKDIR /app

# Copy the requirements file first so Docker can cache this layer
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend source code
COPY . .

# Expose the port the API will run on
EXPOSE 8000

# Default command: start the FastAPI server
# Override this in docker-compose.yml for collector/analysis workers
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
