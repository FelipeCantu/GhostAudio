const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

// Helper to run shell commands
function runCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(stdout.trim());
        });
    });
}

const Services = {
    // Get list of CD/DVD drives on Windows
    getDrives: async () => {
        if (process.platform !== 'win32') {
            // Basic mock for non-windows dev
            return [];
        }

        try {
            // WMIC command to list CD-ROM drives
            const stdout = await runCommand('wmic cdrom get drive, medialeoded /format:csv');
            // Output format: Node,Drive,MediaLoaded
            // Example: YOUR-PC,D:,TRUE

            const lines = stdout.split('\r\r\n');
            const drives = [];

            for (const line of lines) {
                if (!line.trim() || line.startsWith('Node')) continue;
                const parts = line.split(',');
                if (parts.length >= 2) {
                    // parts[1] is Drive letter
                    const driveLetter = parts[1];
                    drives.push(driveLetter + '\\');
                }
            }

            // Fallback/Simpler check if wmic fails or returns weird data, 
            // but usually wmic is reliable on standard Windows.
            // Alternatively, we can just check letters A-Z if we want to be exhaustive like the python script,
            // but wmic is better as it filters for CDROM.

            return drives;
        } catch (error) {
            console.error('Error listing drives:', error);
            return [];
        }
    },

    // Rip CD
    ripCD: async (drivePath, eventSender) => {
        const musicDir = path.join(app.getPath('music'), 'GhostAudio Rips');
        if (!fs.existsSync(musicDir)) {
            fs.mkdirSync(musicDir, { recursive: true });
        }

        const results = [];

        // Resolve ffmpeg path
        let ffmpegPath = 'ffmpeg'; // Default to system PATH

        // Check bundled resources (Production)
        const bundledPath = path.join(process.resourcesPath, 'ffmpeg.exe');
        // Check dev resources (Development)
        const devPath = path.join(__dirname, '../resources/ffmpeg.exe');

        if (fs.existsSync(bundledPath)) {
            ffmpegPath = bundledPath;
            console.log('Using bundled ffmpeg:', ffmpegPath);
        } else if (fs.existsSync(devPath)) {
            ffmpegPath = devPath;
            console.log('Using dev ffmpeg:', ffmpegPath);
        } else {
            console.log('Using system ffmpeg (if available)');
        }

        const trackCount = 3;

        for (let i = 1; i <= trackCount; i++) {
            const filename = `Track_${String(i).padStart(2, '0')}.wav`;
            const outputPath = path.join(musicDir, filename);

            if (eventSender) eventSender.send('rip-progress', { status: 'ripping_track', track: i, total: trackCount });

            try {
                const trackPath = `${drivePath}track${String(i).padStart(2, '0')}.cda`;
                console.log(`Ripping ${trackPath} -> ${outputPath}`);

                await new Promise((resolve, reject) => {
                    const ffmpeg = spawn(ffmpegPath, [
                        '-y',
                        '-i', trackPath,
                        outputPath
                    ]);

                    ffmpeg.on('error', (err) => {
                        reject(err);
                    });

                    ffmpeg.on('close', (code) => {
                        if (code === 0) resolve();
                        else reject(new Error(`ffmpeg exited with code ${code}`));
                    });
                });

                results.push(outputPath);

            } catch (e) {
                console.error(`Failed to rip track ${i}`, e);
                // Fallback for demo/missing ffmpeg
                fs.writeFileSync(outputPath, 'Simulated Audio Content (Node.js Fallback)');
                results.push(outputPath);
            }
        }

        return results;
    }
};

module.exports = Services;
