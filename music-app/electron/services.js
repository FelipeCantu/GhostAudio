const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, net } = require('electron');

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
        const url = 'http://127.0.0.1:8000/api/system/check/';
        try {
            const response = await fetch(url);
            if (!response.ok) return { ffmpeg_found: false, error: `Backend status: ${response.status}` };
            return await response.json();
        } catch (e) {
            console.warn("Standard fetch failed, trying net.request fallback...", e);
            try {
                return await new Promise((resolve, reject) => {
                    const request = net.request(url);
                    request.on('response', (response) => {
                        let data = '';
                        response.on('data', (chunk) => data += chunk);
                        response.on('end', () => {
                            try {
                                resolve(JSON.parse(data));
                            } catch (parseErr) {
                                reject(parseErr);
                            }
                        });
                    });
                    request.on('error', (err) => reject(err));
                    request.end();
                });
            } catch (netErr) {
                console.error("All connection attempts failed:", netErr);
                return { ffmpeg_found: false, error: `Connection failed: ${e.message}` };
            }
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

        // on Windows 11, WMIC is deprecated/missing. Try PowerShell first.
        let drives = await getDrivesFromPowershell();

        if (!drives || drives.length === 0) {
            // Fallback to WMIC if PowerShell yields nothing (unlikely but safe)
            const wmicDrives = await getDrivesFromWmic();
            if (wmicDrives && wmicDrives.length > 0) {
                drives = wmicDrives;
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

    getCdMetadata: async (args) => {
        const drivePath = args.drive_path;
        console.log(`[Electron] Fetching Metadata for: ${drivePath}`);
        const url = 'http://127.0.0.1:8000/api/metadata/';
        const body = JSON.stringify({ drive_path: drivePath });

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: body
            });
            if (!response.ok) return { error: `Backend status: ${response.status}` };
            return await response.json();
        } catch (e) {
            console.warn("Standard fetch failed for metadata, trying net.request fallback...", e);
            try {
                return await new Promise((resolve, reject) => {
                    const request = net.request({
                        method: 'POST',
                        url: url,
                        headers: { 'Content-Type': 'application/json' }
                    });

                    request.on('response', (response) => {
                        let data = '';
                        response.on('data', (chunk) => data += chunk);
                        response.on('end', () => {
                            try {
                                resolve(JSON.parse(data));
                            } catch (parseErr) {
                                reject(parseErr);
                            }
                        });
                    });
                    request.on('error', (err) => reject(err));
                    request.write(body);
                    request.end();
                });
            } catch (netErr) {
                console.error("All metadata connection attempts failed:", netErr);
                return { error: `Connection failed: ${e.message}` };
            }
        }
    },

    // Cancel an active rip session
    cancelRip: async (sessionId) => {
        const url = 'http://127.0.0.1:8000/api/rip/cancel/';
        const body = JSON.stringify({ session_id: sessionId });
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: body
            });
            return await response.json();
        } catch (e) {
            console.warn('[Electron cancelRip] fetch failed, trying net.request:', e);
            try {
                return await new Promise((resolve, reject) => {
                    const request = net.request({ method: 'POST', url });
                    request.setHeader('Content-Type', 'application/json');
                    request.on('response', (response) => {
                        let data = '';
                        response.on('data', (chunk) => data += chunk);
                        response.on('end', () => {
                            try { resolve(JSON.parse(data)); }
                            catch (parseErr) { reject(parseErr); }
                        });
                    });
                    request.on('error', (err) => reject(err));
                    request.write(body);
                    request.end();
                });
            } catch (netErr) {
                console.error('[Electron cancelRip] All attempts failed:', netErr);
                return { error: netErr.message };
            }
        }
    },

    // Rip CD - Proxies to Django Backend with streaming progress
    ripCD: async (args, eventSender) => {
        // args contains { drive_path, mongo_user_id, token, metadata }
        const drivePath = args.drive_path;
        const mongoUserId = args.mongo_user_id;
        const metadata = args.metadata;

        console.log(`[Electron ripCD] Starting - drive: ${drivePath}, user: ${mongoUserId}`);
        console.log(`[Electron ripCD] Metadata:`, JSON.stringify(metadata).substring(0, 200));

        // Use streaming endpoint for real-time progress
        const url = 'http://127.0.0.1:8000/api/rip/stream/';
        const body = JSON.stringify({
            drive_path: drivePath,
            mongo_user_id: mongoUserId,
            metadata: metadata
        });

        return new Promise((resolve, reject) => {
            console.log('[Electron ripCD] Starting streaming request...');

            const request = net.request({
                method: 'POST',
                url: url
            });

            request.setHeader('Content-Type', 'application/json');

            let lastProgress = null;
            let settled = false;  // Track whether promise has been resolved/rejected

            request.on('response', (response) => {
                console.log(`[Electron ripCD] Response status: ${response.statusCode}`);

                if (response.statusCode !== 200) {
                    let errorData = '';
                    response.on('data', (chunk) => errorData += chunk);
                    response.on('end', () => {
                        if (!settled) {
                            settled = true;
                            reject(new Error(`Server error: ${response.statusCode} - ${errorData}`));
                        }
                    });
                    return;
                }

                response.on('data', (chunk) => {
                    const text = chunk.toString();
                    // Parse SSE format: "data: {...}\n\n"
                    const lines = text.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.substring(6));
                                console.log('[Electron ripCD] Progress:', data);

                                // Send progress to renderer
                                if (eventSender && !eventSender.isDestroyed()) {
                                    eventSender.send('rip-progress', data);
                                }

                                lastProgress = data;

                                if (data.type === 'complete' && !settled) {
                                    settled = true;
                                    resolve({ status: 'completed', tracks: data.tracks });
                                } else if (data.type === 'error' && !settled) {
                                    settled = true;
                                    reject(new Error(data.message));
                                }
                            } catch (parseErr) {
                                // Ignore parse errors for partial chunks
                            }
                        }
                    }
                });

                response.on('end', () => {
                    console.log('[Electron ripCD] Stream ended');
                    if (settled) return;
                    settled = true;
                    // Only resolve as completed if we actually got a complete event
                    if (lastProgress?.type === 'complete') {
                        resolve({ status: 'completed', tracks: lastProgress.tracks });
                    } else {
                        // Stream ended without complete or error - treat as failure
                        reject(new Error('Import stream ended unexpectedly without completion'));
                    }
                });
            });

            request.on('error', (err) => {
                console.error('[Electron ripCD] Request error:', err);
                if (!settled) {
                    settled = true;
                    reject(err);
                }
            });

            request.write(body);
            request.end();
        });
    },

    getLibrary: async (token, mongoUserId) => {
        // Use MongoDB endpoint for desktop app
        if (mongoUserId) {
            try {
                console.log(`[Electron] Fetching library for user: ${mongoUserId}`);
                const response = await fetch(`http://127.0.0.1:8000/api/mongo/library/?user_id=${mongoUserId}`);
                console.log(`[Electron] Library response status: ${response.status}`);
                if (!response.ok) {
                    const errText = await response.text();
                    console.error(`[Electron] Library error response: ${errText}`);
                    throw new Error('Failed to fetch library from MongoDB');
                }
                const data = await response.json();
                console.log(`[Electron] Library data received: ${data.length} albums`);
                if (data.length > 0) {
                    console.log(`[Electron] First album tracks:`, data[0].tracks?.length || 0);
                }
                return data;
            } catch (e) {
                console.error("[Electron] MongoDB Library Fetch Failed:", e);
                throw e;
            }
        }

        // Fallback to Django auth (legacy)
        try {
            const response = await fetch('http://127.0.0.1:8000/api/library/', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!response.ok) throw new Error('Failed to fetch library');
            return await response.json();
        } catch (e) {
            console.error("[Electron] Library Fetch Failed:", e);
            throw e;
        }
    },

    deleteAlbum: async (albumId, mongoUserId) => {
        if (!mongoUserId || !albumId) {
            throw new Error('Album ID and User ID required');
        }
        try {
            const response = await fetch(`http://127.0.0.1:8000/api/mongo/library/${albumId}/?user_id=${mongoUserId}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Failed to delete album');
            return await response.json();
        } catch (e) {
            console.error("[Electron] Delete Album Failed:", e);
            throw e;
        }
    },

    getDashboardStats: async (token, mongoUserId) => {
        const defaultStats = { total_albums: 0, total_tracks: 0, recent_albums: [] };

        // Use MongoDB endpoint for desktop app
        if (mongoUserId) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);
                const response = await fetch(`http://127.0.0.1:8000/api/mongo/stats/?user_id=${mongoUserId}`, {
                    signal: controller.signal
                });
                clearTimeout(timeout);
                if (!response.ok) {
                    console.warn("[Electron] MongoDB stats returned", response.status, "- using defaults");
                    return defaultStats;
                }
                return await response.json();
            } catch (e) {
                console.warn("[Electron] MongoDB stats unavailable, using defaults");
                return defaultStats;
            }
        }

        // Fallback to Django auth (legacy)
        try {
            const response = await fetch('http://127.0.0.1:8000/api/dashboard/stats/', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!response.ok) {
                console.warn("[Electron] Dashboard stats returned", response.status, "- using defaults");
                return defaultStats;
            }
            return await response.json();
        } catch (e) {
            console.warn("[Electron] Dashboard stats unavailable, using defaults");
            return defaultStats;
        }
    }
};

module.exports = Services;
