FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04
RUN apt-get update && apt-get install -y python3 python3-pip git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN pip3 install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cu121
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt
COPY trainer ./trainer
ENV PYTHONUNBUFFERED=1
ENTRYPOINT ["python3", "-m", "trainer"]
