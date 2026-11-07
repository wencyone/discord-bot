const fs = require('node:fs');
const path = require('node:path');
const directory = path.join(__dirname, '../../data/polls');

function filename(id) {
    if (!/^\d{17,20}$/.test(id)) throw new Error('Invalid poll message ID.');
    return path.join(directory, `${id}.json`);
}

function loadPoll(id) {
    try { return JSON.parse(fs.readFileSync(filename(id), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function savePoll(data) {
    const file = filename(data.id);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(`${file}.tmp`, file);
}

function removePoll(id) { fs.rmSync(filename(id), { force: true }); }

function listPolls() {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory).filter(name => /^\d{17,20}\.json$/.test(name))
        .map(name => loadPoll(name.slice(0, -5)));
}

module.exports = { loadPoll, savePoll, removePoll, listPolls };
