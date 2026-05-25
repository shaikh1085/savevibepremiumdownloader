# Node 18 Bookworm use kar rahe hain jisme Python 3.11 default hota hai
FROM node:18-bookworm-slim

# System packages (Python 3, FFmpeg, aur Curl) install karein
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Latest yt-dlp binary install karein
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
