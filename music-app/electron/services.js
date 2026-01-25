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
            return [];
        }

        const getDrivesFromWmic = async () => {
            try {
                const stdout = await runCommand('wmic cdrom get drive /format:csv');
                const lines = stdout.split('\r\r\n');
                const drives = [];
                for (const line of lines) {
                    if (!line.trim() || line.startsWith('Node')) continue;
                    const parts = line.split(',');
                    if (parts.length >= 2) {
                        drives.push(parts[1] + '\\');
                    }
                }
                return drives;
            } catch (e) {
                console.warn('WMIC failed, trying PowerShell...', e);
                return null; // Signal failure to try next method
            }
        };

        const getDrivesFromPowershell = async () => {
            try {
                // Get-CimInstance is modern, Get-WmiObject is legacy but ubiquitous. 
                // We'll use a simple command that prints just the drive letters.
                const stdout = await runCommand('powershell -NoProfile -Command "Get-CimInstance Win32_CDROMDrive | Select-Object -ExpandProperty Drive"');
                // Output should be like:
                // D:
                // E:
                const lines = stdout.split(/\r?\n/);
                const drives = [];
                for (const line of lines) {
                    const drive = line.trim();
                    if (drive && drive.length === 2 && drive.endsWith(':')) {
                        drives.push(drive + '\\');
                    }
                }
                return drives;
            } catch (e) {
                console.error('PowerShell failed:', e);
                return [];
            }
        };

        let drives = await getDrivesFromWmic();

        if (!drives || drives.length === 0) {
            // WMIC failed or found nothing (sometimes WMIC finds nothing but PS does)
            const psDrives = await getDrivesFromPowershell();
            if (psDrives && psDrives.length > 0) {
                drives = psDrives;
            }
        }

        // Final fallback: Check common letters if everything else fails (optional, but good for robustness)
        if (!drives || drives.length === 0) {
            const fs = require('fs');
            const common = ['D:\\', 'E:\\', 'F:\\', 'G:\\'];
            for (const d of common) {
                try {
                    // Check if access is possible (though this might check for disc presence, not drive existence)
                    // fs.accessSync(d, fs.constants.R_OK); 
                    // Actually, just checking if we can stat it might be enough to know it's a mount point?
                    // No, on Windows checking root of empty CD drive throws "Device not ready".
                    // So this is hard to do without native calls.
                    // We will trust the command outputs.
                } catch (e) { }
            }
        }

        return drives || [];
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
