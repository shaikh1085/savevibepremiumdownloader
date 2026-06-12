const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.get('/sitemap.xml', (req, res) => {
    res.setHeader('Content-Type', 'application/xml; charset=UTF-8');
    res.sendFile(path.join(__dirname, 'public', 'sitemap.xml'));
});
app.use(express.static('public'));  

// ... baad mein

// ─── GET VIDEO INFO (Handles both Direct Link and Keyword Search with Expanded Formats) ───
app.post('/api/info', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL or Search term required' });

    const trimmedInput = url.trim();

    // Check karein ke input valid URL hai ya search keyword
    let isUrl = false;
    try {
        new URL(trimmedInput);
        isUrl = true;
    } catch (_) {
        isUrl = false;
    }

    const args = [
        '--dump-json', 
        '--no-playlist',
    ];

    // Agar cookies.txt mojud ho toh use shamil karein
    const cookiePath = path.join(__dirname, 'cookies.txt');
    if (fs.existsSync(cookiePath)) {
        args.push('--cookies', 'cookies.txt');
        console.log('🍪 Using cookies.txt for authentication');
    } else {
        // Sirf YouTube ke liye iOS client args
        const isYouTube = isUrl && (trimmedInput.includes('youtube.com') || trimmedInput.includes('youtu.be'));
        if (isYouTube) {
            args.push('--extractor-args', 'youtube:player-client=ios', '--force-ipv4');
        }
    }

    // Input ke mutabiq yt-dlp arguments set karein
    if (isUrl) {
        args.push(trimmedInput);
    } else {
        args.push(`ytsearch5:${trimmedInput}`); // Keyword search ke liye top 5 results
    }

    execFile('yt-dlp', args, { timeout: 30000 }, (err, stdout, stderr) => {
        if (err) {
            console.error('yt-dlp error:', stderr || err.message);
            return res.status(500).json({ error: 'Could not fetch details. Request failed.' });
        }
        try {
            if (isUrl) {
                // Case 1: Agar direct URL pasted hai
                const data = JSON.parse(stdout);
                res.json({
                    success: true,
                    isUrl: true,
                    title: data.title || 'Video',
                    thumbnail: data.thumbnail || '',
                    duration: data.duration_string || '',
                    uploader: data.uploader || '',
                    url: data.webpage_url || data.original_url || trimmedInput,
                    formats: [
                        { label: '🎬 Best Quality (MP4)', value: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best', type: 'video' },
                        { label: '💎 2160p 4K (MP4)', value: 'bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/best[height<=2160][ext=mp4]', type: 'video' },
                        { label: '🌟 1440p 2K (MP4)', value: 'bestvideo[height<=1440][ext=mp4]+bestaudio[ext=m4a]/best[height<=1440][ext=mp4]', type: 'video' },
                        { label: '✨ 1080p Full HD (MP4)', value: 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]', type: 'video' },
                        { label: '📺 720p HD (MP4)', value: 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]', type: 'video' },
                        { label: '📱 480p (MP4)', value: 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]', type: 'video' },
                        { label: '🔋 360p Medium (MP4)', value: 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360]', type: 'video' },
                        { label: '📉 240p Low (MP4)', value: 'bestvideo[height<=240][ext=mp4]+bestaudio[ext=m4a]/best[height<=240]', type: 'video' },
                        { label: '🎵 Audio Only (MP3)', value: 'bestaudio', type: 'audio' },
                    ]
                });
            } else {
                // Case 2: Agar user ne sirf text/keyword search kiya hai
                const lines = stdout.trim().split('\n').filter(line => line.trim() !== '');
                const results = lines.map(line => {
                    const data = JSON.parse(line);
                    return {
                        title: data.title || 'Video',
                        thumbnail: data.thumbnail || '',
                        duration: data.duration_string || '',
                        uploader: data.uploader || '',
                        url: data.webpage_url || data.original_url || ''
                    };
                });
                res.json({
                    success: true,
                    isUrl: false,
                    results: results
                });
            }
        } catch (e) {
            console.error('Parsing error:', e);
            res.status(500).json({ error: 'Failed to parse video data.' });
        }
    });
});

// ─── DOWNLOAD VIDEO (Aapka original working setup - untouched) ─────────────────────
app.post('/api/download', (req, res) => {
    const { url, format, type } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const tmpDir = os.tmpdir();
    const filename = `savevibe_${Date.now()}`;
    const outputTemplate = path.join(tmpDir, `${filename}.%(ext)s`);

    const args = [];
    if (type === 'audio') {
        args.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0');
    } else {
        const formatArg = format || 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
        args.push('-f', formatArg, '--merge-output-format', 'mp4');
    }

    // Agar cookies.txt mojud ho toh use shamil karein
    const cookiePath = path.join(__dirname, 'cookies.txt');
    if (fs.existsSync(cookiePath)) {
        args.push('--cookies', 'cookies.txt');
    } else {
        // Sirf YouTube ke liye iOS client args
        const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
        if (isYouTube) {
            args.push('--extractor-args', 'youtube:player-client=ios', '--force-ipv4');
        }
    }

    args.push('-o', outputTemplate, url);

    console.log('Running yt-dlp with arguments:', args);

    execFile('yt-dlp', args, { timeout: 120000 }, (err, stdout, stderr) => {
        if (err) {
            console.error('Download error:', stderr || err.message);
            return res.status(500).json({ error: 'Download failed. Please try again.' });
        }

        const ext = type === 'audio' ? 'mp3' : 'mp4';
        const filePath = path.join(tmpDir, `${filename}.${ext}`);

        const streamAndCleanup = (fileToStream, finalExtension) => {
            const mimeType = type === 'audio' ? 'audio/mpeg' : 'video/mp4';
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Disposition', `attachment; filename="savevibe_download.${finalExtension}"`);

            const stream = fs.createReadStream(fileToStream);
            stream.pipe(res);

            stream.on('end', () => {
                try {
                    fs.unlinkSync(fileToStream);
                } catch (e) {
                    console.error('Failed to delete temp file:', e.message);
                }
            });

            stream.on('error', (streamErr) => {
                console.error('Streaming error:', streamErr);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Streaming failed.' });
                }
            });
        };

        if (fs.existsSync(filePath)) {
            streamAndCleanup(filePath, ext);
        } else {
            const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(filename));
            if (files.length === 0) {
                return res.status(500).json({ error: 'Downloaded file not found.' });
            }
            const foundFile = path.join(tmpDir, files[0]);
            const actualExt = files[0].split('.').pop();
            streamAndCleanup(foundFile, actualExt);
        }
    });
});
// Sitemap - proper XML Content-Type
app.get('/sitemap.xml', (req, res) => {
    res.setHeader('Content-Type', 'application/xml; charset=UTF-8');
    res.sendFile(path.join(__dirname, 'public', 'sitemap.xml'));
});
app.listen(PORT, () => {
    console.log(`✅ SaveVibe Server running at http://localhost:${PORT}`);
});
