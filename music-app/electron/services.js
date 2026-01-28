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
    getSystemStatus: async () => {
        try {
            const response = await fetch('http://127.0.0.1:8000/api/system/check/');
            if (!response.ok) return { ffmpeg_found: false, error: 'Backend unreachable' };
            return await response.json();
        } catch (e) {
            return { ffmpeg_found: false, error: e.message };
        }
    },

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

    // Rip CD - Proxies to Django Backend
    ripCD: async (args, eventSender) => {
        // args contains { drive_path, mongo_user_id, token }
        const drivePath = args.drive_path || args; // Handle both object and string for backward compat
        const mongoUserId = args.mongo_user_id;

        console.log(`[Electron] Requesting Rip for drive: ${drivePath}, User: ${mongoUserId}`);

        try {
            // Call Django API
            const response = await fetch('http://127.0.0.1:8000/api/rip/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    drive_path: drivePath,
                    mongo_user_id: mongoUserId,
                    // metadata: {} // Let backend fetch metadata
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Rip failed significantly');
            }

            return data; // { status: 'completed', album: ... }

        } catch (e) {
            console.error("[Electron] Rip Proxy Failed:", e);
            // Fallback? No, we want to rely on the backend.
            throw e;
        }
    }
};

module.exports = Services;
