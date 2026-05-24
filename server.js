const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process'); // Safe from shell injection & escaping issues
const path = require('path');
const fs = require('fs');
const os = require('os');

// ─── AUTO-CREATE CORRECT NIXPACKS.TOML FOR RAILWAY ───────────────────────────
// Yeh code har baar chalne par sahi nixpacks.toml file (python3 ke sath) update karega
const nixpacksPath = path.join(__dirname, 'nixpacks.toml');
try {
    fs.writeFileSync(nixpacksPath, `[phases.setup]\nnixPkgs = ["...", "ffmpeg", "python3", "yt-dlp"]\n`);
    console.log('✅ nixpacks.toml verified and updated with python3!');
} catch (err) {
    console.error('Failed to write nixpacks.toml:', err.message);
}
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ─── GET VIDEO INFO (title, thumbnail, formats) ───────────────────────────────
app.post('/api/info', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    // execFile use kiya hai jo special characters jaise '&' ko sahi se handle karta hai
    execFile('yt-dlp', ['--dump-json', '--no-playlist', url], { timeout: 30000 }, (err, stdout, stderr) => {
        if (err) {
            console.error('yt-dlp error:', stderr || err.message);
            return res.status(500).json({ error: 'Could not fetch video info. Make sure yt-dlp is installed and URL is valid.' });
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
    args.push('-o', outputTemplate, url);

    console.log('Running yt-dlp with arguments:', args);

    execFile('yt-dlp', args, { timeout: 120000 }, (err, stdout, stderr) => {
        if (err) {
            console.error('Download error:', stderr || err.message);
            return res.status(500).json({ error: 'Download failed. Make sure ffmpeg is installed on the system.' });
        }

        const ext = type === 'audio' ? 'mp3' : 'mp4';
        const filePath = path.join(tmpDir, `${filename}.${ext}`);

        // Helper function for file streaming
        const streamAndCleanup = (fileToStream, finalExtension) => {
            const mimeType = type === 'audio' ? 'audio/mpeg' : 'video/mp4';
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Disposition', `attachment; filename="savevibe_download.${finalExtension}"`);

            const stream = fs.createReadStream(fileToStream);
            stream.pipe(res);

            stream.on('end', () => {
                try {
                    fs.unlinkSync(fileToStream); // Delete temp file after download completes
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
            // Backup fallback (e.g., if ffmpeg is missing and video outputted as another extension)
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
