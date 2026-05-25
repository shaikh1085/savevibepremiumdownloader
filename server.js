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
app.use(express.static('public'));

// ─── GET VIDEO INFO (title, thumbnail, formats) ───────────────────────────────
app.post('/api/info', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    // iOS client emulation aur force-ipv4 flags lagaye hain taake YouTube robot detection bypass ho sake
    const args = [
        '--dump-json', 
        '--no-playlist', 
        '--extractor-args', 'youtube:player-client=ios', 
        '--force-ipv4',
        url
    ];

    execFile('yt-dlp', args, { timeout: 30000 }, (err, stdout, stderr) => {
        if (err) {
            console.error('yt-dlp error:', stderr || err.message);
            return res.status(500).json({ error: 'Could not fetch video info. YouTube blocked the request or URL is invalid.' });
        }
        try {
            const data = JSON.parse(stdout);
            res.json({
                title: data.title || 'Video',
                thumbnail: data.thumbnail || '',
                duration: data.duration_string || '',
                uploader: data.uploader || '',
                formats: [
                    { label: 'Best Quality (MP4)', value: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best', type: 'video' },
                    { label: '720p HD (MP4)', value: 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]', type: 'video' },
                    { label: '480p (MP4)', value: 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]', type: 'video' },
                    { label: 'Audio Only (MP3)', value: 'bestaudio', type: 'audio' },
                ]
            });
        } catch (e) {
            res.status(500).json({ error: 'Failed to parse video data.' });
        }
    });
});

// ─── DOWNLOAD VIDEO ───────────────────────────────────────────────────────────
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
    
    // iOS client emulation aur force-ipv4 yahan bhi apply kiya hai
    args.push('--extractor-args', 'youtube:player-client=ios', '--force-ipv4', '-o', outputTemplate, url);

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

app.listen(PORT, () => {
    console.log(`✅ SaveVibe Server running at http://localhost:${PORT}`);
});
