const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits, Events } = require('discord.js');
const system = require('../../system');
const { buildTicketPanel } = require('./panel');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.on(Events.Error, error => console.error('[TICKETS]', error.message));
client.once(Events.ClientReady, async () => {
    try {
        const guild = await client.guilds.fetch(system.guildId);
        const channels = await guild.channels.fetch();
        const panel = channels.get(system.tickets.panelChannelId);
        const logs = channels.get(system.tickets.logChannelId);
        const category = channels.get(system.tickets.categoryId);
        if (panel?.type !== ChannelType.GuildText || logs?.type !== ChannelType.GuildText || category?.type !== ChannelType.GuildCategory) {
            throw new Error('Configure valid panel, category and log channels in system.js.');
        }
        const roles = await guild.roles.fetch();
        if (!system.tickets.staffRoleIds.length || system.tickets.staffRoleIds.some(id => !roles.has(id) || id === guild.id)) {
            throw new Error('Configure valid staff roles in system.js.');
        }
        const bot = await guild.members.fetchMe();
        if (!bot.permissions.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])) {
            throw new Error('The bot needs Manage Channels and Manage Roles permissions.');
        }
        const access = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles];
        await logs.permissionOverwrites.set([
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: client.user.id, allow: [...access, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.ManageThreads] },
            ...system.tickets.staffRoleIds.map(id => ({ id, allow: access })),
        ], 'Keep ticket transcripts private to club leaders.');
        const message = await panel.send(await buildTicketPanel());
        console.log(`[TICKETS] Panel published: ${message.url}`);
    } catch (error) {
        console.error('[TICKETS]', error.message);
        process.exitCode = 1;
    } finally { client.destroy(); }
});
client.login(system.token).catch(error => {
    console.error('[TICKETS]', error.message);
    client.destroy();
    process.exitCode = 1;

});
