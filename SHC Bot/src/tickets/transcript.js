const { ChannelType, EmbedBuilder, escapeMarkdown } = require('discord.js');
const { types } = require('./panel');

function splitText(text, limit = 1900) {
    const chunks = [];
    let remaining = text;
    while (remaining.length) {
        let end = Math.min(limit, remaining.length);
        if (end < remaining.length && /[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
        chunks.push(remaining.slice(0, end));
        remaining = remaining.slice(end);
    }
    return chunks;
}

async function archiveTicket(channel, data, system, save) {
    const logs = await channel.guild.channels.fetch(system.tickets.logChannelId);
    if (!logs || logs.type !== ChannelType.GuildText) throw new Error('Ticket logs must be a server text channel.');
    const messages = [];
    if (!data.snapshotBefore) {
        const latest = await channel.messages.fetch({ limit: 1 });
        data.snapshotBefore = latest.size ? (BigInt(latest.first().id) + 1n).toString() : channel.id;
        await save();
    }
    let before = data.snapshotBefore;
    while (true) {
        const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        if (!batch.size) break;
        messages.push(...batch.values());
        before = batch.last().id;
    }
    messages.sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1);

    let thread = data.logThread ? await logs.threads.fetch(data.logThread) : null;
    if (!thread) {
        const header = await logs.send({
            embeds: [new EmbedBuilder().setTitle(`Closed Ticket • ${channel.name}`).setColor(0xd8c7a3)
                .setDescription('Open the thread below to read the conversation in chronological order.')
                .addFields(
                    { name: 'Ticket owner', value: `<@${data.owner}>`, inline: true },
                    { name: 'Student ID', value: data.student, inline: true },
                    { name: 'Category', value: types[data.type]?.label || data.type, inline: true },
                    { name: 'Handled by', value: data.claimant ? `<@${data.claimant}>` : 'Unclaimed', inline: true },
                    { name: 'Closed by', value: `<@${data.closer}>`, inline: true },
                    { name: 'Messages', value: String(messages.length), inline: true },
                ).setTimestamp()],
            allowedMentions: { parse: [] },
        });
        thread = await header.startThread({ name: `${channel.name} • transcript`.slice(0, 100), autoArchiveDuration: 10080 });
        data.logThread = thread.id;
        data.logProgress = 0;
        await save();
    }
    if (thread.archived) await thread.setArchived(false);
    const pages = [];
    for (const message of messages) {
        const sections = [];
        if (message.content) sections.push(message.content);
        for (const embed of message.embeds) {
            if (embed.title) sections.push(`**${escapeMarkdown(embed.title)}**`);
            if (embed.description) sections.push(embed.description);
            for (const field of embed.fields || []) sections.push(`**${escapeMarkdown(field.name)}**\n${field.value}`);
            if (embed.image?.url) sections.push(embed.image.url);
        }
        for (const attachment of message.attachments.values()) {
            sections.push(`Attachment: ${attachment.name}\n${attachment.url}`);
        }
        if (message.stickers?.size) sections.push(`Stickers: ${message.stickers.map(s => s.name).join(', ')}`);
        if (!sections.length) sections.push('*No text content.*');
        if (message.reference?.messageId) sections.push(`Reply to message: ${message.reference.messageId}`);
        const parts = splitText(sections.join('\n\n'), 3800);
        parts.forEach((description, index) => {
            const embed = new EmbedBuilder().setColor(message.author.bot ? 0x617468 : 0xd8c7a3)
                .setAuthor({ name: (message.member?.displayName || message.author.globalName || message.author.username || message.author.tag).slice(0, 256) })
                .setDescription(description)
                .setFooter({ text: `User ID: ${message.author.id}${parts.length > 1 ? ` • Part ${index + 1}/${parts.length}` : ''}` })
                .setTimestamp(message.createdAt);
            if (message.author.displayAvatarURL) embed.setAuthor({
                name: embed.data.author.name,
                iconURL: message.author.displayAvatarURL({ extension: 'png', size: 64 }),
            });
            pages.push(embed);
        });
    }
    for (let i = data.logProgress || 0; i < pages.length; i++) {
        await thread.send({ embeds: [pages[i]], allowedMentions: { parse: [] } });
        data.logProgress = i + 1;
        await save();
    }
    await thread.send({ embeds: [new EmbedBuilder().setColor(0x617468).setDescription(`**End of conversation** • ${messages.length} messages archived.`)], allowedMentions: { parse: [] } });
    await thread.setArchived(true);
    return thread;
}

module.exports = { archiveTicket, splitText };
