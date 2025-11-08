FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Create necessary directories for uploads
RUN mkdir -p static/uploads/todo static/uploads/doing static/uploads/done static/uploads/archived

# Expose port
EXPOSE 5000

# Run the application
CMD ["python", "app.py"]