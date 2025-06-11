# Sử dụng Python base image
FROM python:3.10-slim

# Thiết lập thư mục làm việc bên trong container
WORKDIR /app

# Sao chép toàn bộ project vào container
COPY . .

# Cài đặt các thư viện cần thiết
RUN pip install --no-cache-dir -r requirements.txt

# Chạy ứng dụng chính
CMD ["python", "-m", "app.main"]
