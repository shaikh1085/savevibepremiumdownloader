const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
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

    const cmd = `yt-dlp --dump-json --no-playlist "${url}"`;

    exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
        if (err) {
            console.error('yt-dlp error:', stderr);
            return res.status(500).json({ error: 'Could not fetch video info. Check the URL.' });
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

    let formatArg = format || 'best[ext=mp4]/best';
    let postProcess = '';

    if (type === 'audio') {
        postProcess = '--extract-audio --audio-format mp3 --audio-quality 0';
    } else {
        formatArg = `"${formatArg}"`;
    }

    const cmd = type === 'audio'
        ? `yt-dlp ${postProcess} -o "${outputTemplate}" "${url}"`
        : `yt-dlp -f ${formatArg} --merge-output-format mp4 -o "${outputTemplate}" "${url}"`;

    console.log('Running:', cmd);

    exec(cmd, { timeout: 120000 }, (err, stdout, stderr) => {
        if (err) {
            console.error('Download error:', stderr);
            return res.status(500).json({ error: 'Download failed. Platform may have restrictions.' });
        }

        // Find the downloaded file
        const ext = type === 'audio' ? 'mp3' : 'mp4';
        const filePath = path.join(tmpDir, `${filename}.${ext}`);

        if (!fs.existsSync(filePath)) {
            // Try to find any file with our prefix
            const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(filename));
            if (files.length === 0) {
                return res.status(500).json({ error: 'Downloaded file not found.' });
            }
            const foundFile = path.join(tmpDir, files[0]);
            const mimeType = type === 'audio' ? 'audio/mpeg' : 'video/mp4';
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Disposition', `attachment; filename="savevibe_download.${files[0].split('.').pop()}"`);
            const stream = fs.createReadStream(foundFile);
            stream.pipe(res);
            stream.on('end', () => { try { fs.unlinkSync(foundFile); } catch(e){} });
            return;
        }

        const mimeType = type === 'audio' ? 'audio/mpeg' : 'video/mp4';
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="savevibe_download.${ext}"`);

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
        stream.on('end', () => { try { fs.unlinkSync(filePath); } catch(e){} });
        stream.on('error', () => res.status(500).json({ error: 'File streaming error.' }));
    });
});

app.listen(PORT, () => {
    console.log(`✅ SaveVibe Server running at http://localhost:${PORT}`);
});
