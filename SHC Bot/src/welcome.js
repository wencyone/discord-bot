const { PermissionFlagsBits, AttachmentBuilder } = require('discord.js');

const { createWelcomeCard } = require('./welcomeCard');

async function assignWelcomeRole(member, system) {
    if (member.guild.id !== system.guildId) return;

    const roleId = system.welcome?.roleId;
    if (!roleId) return;
    if (typeof roleId !== 'string' || !/^\d{17,20}$/.test(roleId)) {
        console.error('[WELCOME] Set a valid welcome.roleId in system.js.');
        return;
    }

    try {
        const role = await member.guild.roles.fetch(roleId);
        if (!role || role.id === member.guild.id || role.managed) {
            console.error('[WELCOME] The configured role is missing or cannot be assigned.');
            return;
        }

        const bot = await member.guild.members.fetchMe();
        if (!bot.permissions.has(PermissionFlagsBits.ManageRoles) || !role.editable) {
            console.error('[WELCOME] The bot needs Manage Roles and a role above the welcome role.');
            return;
        }

        if (member.roles.cache.has(roleId)) return;
        await member.roles.add(role, 'Automatic welcome role');
    } catch (error) {
        console.error('[WELCOME] Failed to assign the welcome role:', error.message);
    }
}

async function sendWelcomeMessage(member, system) {
    if (member.guild.id !== system.guildId || !system.welcome?.channelId) return;

    try {
        const channel = await member.guild.channels.fetch(system.welcome.channelId);
        if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') {
            console.error('[WELCOME] Configure a valid welcome text channel in system.js.');
            return;
        }

        const image = await createWelcomeCard(member);
        await channel.send({
            allowedMentions: { parse: [] },
            files: [new AttachmentBuilder(image, { name: 'welcome.png' })],
        });

        const mention = await channel.send({
            content: `<@${member.id}>`,
            allowedMentions: { users: [member.id], roles: [], parse: [] },
        });
        await mention.delete().catch((error) => {
            console.error('[WELCOME] Failed to delete the welcome mention:', error.message);
        });
    } catch (error) {
        console.error('[WELCOME] Failed to send the welcome card:', error.message);
    }
}

module.exports = { assignWelcomeRole, sendWelcomeMessage };
