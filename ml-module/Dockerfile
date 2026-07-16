FROM nvidia/cuda:12.5.1-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
ENV TF_CPP_MIN_LOG_LEVEL=1
ENV XLA_FLAGS=--xla_gpu_cuda_data_dir=/usr/local/cuda

WORKDIR /workspace/ml-module

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        python3-venv \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/local/bin/python \
    && ln -sf /usr/bin/pip3 /usr/local/bin/pip

COPY requirements.txt ./

RUN python -m pip install --upgrade pip \
    && python -m pip install --no-cache-dir -r requirements.txt

RUN TF_DIR="$(dirname "$(python -c 'import tensorflow; print(tensorflow.__file__)')")" \
    && cd "$TF_DIR" \
    && ln -svf ../nvidia/*/lib/*.so* .

COPY . .

CMD ["python", "-m", "src.train"]