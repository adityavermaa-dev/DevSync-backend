const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const sourceRoot = path.join(__dirname, "..", "..");
const srcDir = path.join(sourceRoot, "src");

const files = [];

function walk(dirPath) {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            walk(fullPath);
            continue;
        }

        if (entry.isFile() && fullPath.endsWith(".js")) {
            files.push(fullPath);
        }
    }
}

walk(srcDir);

const failures = [];

for (const filePath of files) {
    try {
        execFileSync(process.execPath, ["--check", filePath], { stdio: "pipe" });
    } catch (error) {
        failures.push({
            filePath,
            output: (error.stderr || error.stdout || error.message || "").toString()
        });
    }
}

if (failures.length === 0) {
    console.log(`Syntax check passed for ${files.length} files.`);
    process.exit(0);
}

console.error(`Syntax check failed in ${failures.length} file(s).`);
for (const failure of failures) {
    console.error(`\nFile: ${failure.filePath}`);
    console.error(failure.output);
}

process.exit(1);
