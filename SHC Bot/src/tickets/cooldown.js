const fs = require('node:fs');
const path = require('node:path');

const duration = 15 * 60 * 1000;
const directory = path.join(__dirname, '../../data/ticket-cooldowns');

function filename(guildId, userId) {
    if (!/^\d{17,20}$/.test(guildId) || !/^\d{17,20}$/.test(userId)) throw new Error('Invalid ticket cooldown IDs.');
    return path.join(directory, `${guildId}-${userId}.json`);
}

function cooldownUntil(guildId, userId) {
    try {
        const data = JSON.parse(fs.readFileSync(filename(guildId, userId), 'utf8'));
        if (!Number.isFinite(data.openedAt)) throw new Error('Invalid ticket cooldown data.');
        return data.openedAt + duration;
    } catch (error) {
        if (error.code === 'ENOENT') return 0;
        throw error;
    }
}

function recordTicketOpen(guildId, userId, openedAt = Date.now()) {
    const file = filename(guildId, userId);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify({ openedAt }), { mode: 0o600 });
    fs.renameSync(`${file}.tmp`, file);
}

function cooldownNotice(guildId, userId) {
    const until = cooldownUntil(guildId, userId);
    if (until <= Date.now()) return null;
    const seconds = Math.ceil((until - Date.now()) / 1000);
    const minutes = Math.floor(seconds / 60);
    return `You can open one ticket every 15 minutes. Please wait ${minutes}m ${seconds % 60}s before opening another ticket.`;
}

module.exports = { cooldownUntil, recordTicketOpen, cooldownNotice };
