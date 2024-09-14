# First stage: Build the executable with PyInstaller
FROM python:3.9-slim AS builder

# Install necessary build dependencies for PyInstaller
RUN apt-get update && apt-get install -y \
    build-essential \
    libssl-dev \
    libffi-dev \
    python3-dev \
    python3-pip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /subj_api_app

# Copy only the necessary files
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

# Install PyInstaller
RUN pip install pyinstaller

# Build the executable with PyInstaller
RUN pyinstaller --onefile -n planriean-msuj main.py

# Second stage: Create a smaller image with only the executable
FROM python:3.9-slim

# Set the working directory
WORKDIR /subj_api_app/dist

# Copy the executable from the first stage
COPY --from=builder /subj_api_app/pg_config_all.ini /subj_api_app/dist/pg_config.ini
COPY --from=builder /subj_api_app/dist/planriean-msuj .

# Set the entrypoint to the executable
ENTRYPOINT ["./planriean-msuj"]
