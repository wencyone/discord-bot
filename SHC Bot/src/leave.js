const { AttachmentBuilder } = require('discord.js');
const { createLeaveCard } = require('./leaveCard');

async function sendLeaveMessage(member, system) {
    if (member.guild.id !== system.guildId || !system.welcome?.channelId) return;

    try {
        const channel = await member.guild.channels.fetch(system.welcome.channelId);
        if (!channel?.isTextBased() || typeof channel.send !== 'function') {
            console.error('[LEAVE] Configure a valid welcome channel in system.js.');
            return;
        }

        await channel.send({
            files: [new AttachmentBuilder(await createLeaveCard(member), { name: 'goodbye.png' })],
            allowedMentions: { parse: [] },
        });
    } catch (error) {
        console.error('[LEAVE] Failed to send the departure card:', error.message);
    }
}

module.exports = { sendLeaveMessage };
