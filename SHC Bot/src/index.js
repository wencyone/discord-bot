const { Client, Events, GatewayIntentBits, ActivityType } = require('discord.js');

const system = require('../system');
const { assignWelcomeRole, sendWelcomeMessage } = require('./welcome');
const { registerTickets } = require('./tickets');
const { registerPolls } = require('./polls');
const { sendLeaveMessage } = require('./leave');
const token = system.token?.trim();
const guildId = system.guildId?.trim();

if (!token || !guildId || !/^\d{17,20}$/.test(guildId)) {
    console.error('[CONFIG] Set token and a valid guildId in system.js.');
    process.exit(1);
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

registerTickets(client, system);
registerPolls(client, system);

let lastCount;
let presenceIndex = 0;
let updateTimer;
let refreshTimer;

function updateMemberCount(force = false) {
    const guild = client.guilds.cache.get(guildId);
    if (!client.isReady() || !guild) return;
    if (!force && (presenceIndex !== 0 || guild.memberCount === lastCount)) return;

    client.user.setPresence({
        status: 'online',
        activities: presenceIndex === 0 ? [{
            name: `Watching Over ${guild.memberCount.toLocaleString('en-US')} Members`,
            type: ActivityType.Watching,
        }] : [{
            name: 'Custom Status',
            state: 'Please follow the SSF rules.',
            type: ActivityType.Custom,
        }],
    });
    if (presenceIndex === 0) lastCount = guild.memberCount;
}

function scheduleMemberCount(member) {
    if (member.guild.id !== guildId || updateTimer) return;
    updateTimer = setTimeout(() => {
        updateTimer = null;
        updateMemberCount();
    }, 5000);
    updateTimer.unref();
}

client.once(Events.ClientReady, () => {
    if (!client.guilds.cache.has(guildId)) {
        console.error('[CONFIG] The bot must be a member of the configured server.');
        client.destroy();
        process.exitCode = 1;
        return;
    }

    updateMemberCount();
    refreshTimer = setInterval(() => {
        presenceIndex = (presenceIndex + 1) % 2;
        updateMemberCount(true);
    }, 10000);
    refreshTimer.unref();
    console.log(`[READY] Logged in as ${client.user.tag}.`);
});

client.on(Events.GuildMemberAdd, scheduleMemberCount);
client.on(Events.GuildMemberAdd, (member) => assignWelcomeRole(member, system));
client.on(Events.GuildMemberAdd, (member) => sendWelcomeMessage(member, system));
client.on(Events.GuildMemberRemove, scheduleMemberCount);
client.on(Events.GuildMemberRemove, (member) => sendLeaveMessage(member, system));
client.on(Events.Error, (error) => console.error('[CLIENT]', error));
client.on(Events.ShardError, (error) => console.error('[CONNECTION]', error));

function shutdown() {
    clearTimeout(updateTimer);
    clearInterval(refreshTimer);
    client.destroy();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

client.login(token).catch((error) => {
    console.error('[LOGIN]', error.message);
    shutdown();
    process.exitCode = 1;
});
