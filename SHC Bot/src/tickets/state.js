const fs = require('node:fs');
const path = require('node:path');

const directory = path.join(__dirname, '../../data/tickets');

function filename(channelId) {
    if (!/^\d{17,20}$/.test(channelId)) throw new Error('Invalid ticket channel ID.');
    return path.join(directory, `${channelId}.json`);
}

function loadState(channelId) {
    const file = filename(channelId);
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
    }
}

function saveState(channelId, data) {
    const file = filename(channelId);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(temporary, file);
}

function removeState(channelId) {
    fs.rmSync(filename(channelId), { force: true });
}

module.exports = { loadState, saveState, removeState };
