const { exec } = require('child_process');

function runCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                // Determine if it's a "command not found" or similar which we might want to catch
                reject(error);
                return;
            }
            resolve(stdout.trim());
        });
    });
}

async function testDriveDetection() {
    console.log("--- Starting Drive Detection Test ---\n");

    const getDrivesFromWmic = async () => {
        console.log("Attempting WMIC...");
        try {
            const stdout = await runCommand('wmic cdrom get drive /format:csv');
            console.log("WMIC Output:\n", stdout);

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
            console.warn("WMIC Failed:", e.message);
            return null;
        }
    };

    const getDrivesFromPowershell = async () => {
        console.log("\nAttempting PowerShell...");
        try {
            const stdout = await runCommand('powershell -NoProfile -Command "Get-CimInstance Win32_CDROMDrive | Select-Object -ExpandProperty Drive"');
            console.log("PowerShell Output:\n", stdout);

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
            console.error("PowerShell Failed:", e.message);
            return [];
        }
    };

    let drives = await getDrivesFromWmic();

    if (!drives || drives.length === 0) {
        console.log("\nWMIC returned no drives or failed. Switching to PowerShell fallback...");
        const psDrives = await getDrivesFromPowershell();
        if (psDrives && psDrives.length > 0) {
            drives = psDrives;
        }
    }

    console.log("\n--- Final Results ---");
    console.log("Detected Drives:", drives);
}

testDriveDetection();
