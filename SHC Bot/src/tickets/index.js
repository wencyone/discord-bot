const {
    Events, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
    MessageFlags, StringSelectMenuBuilder,
} = require('discord.js');
const { types } = require('./panel');
const { archiveTicket } = require('./transcript');
const { loadState, saveState, removeState } = require('./state');
const { cooldownNotice, recordTicketOpen } = require('./cooldown');

const prefix = 'ssf-ticket:';
const channelLocks = new Set();
const opening = new Set();
const closeTimers = new Map();

function readTicket(channel) {
    if (!channel?.topic?.startsWith(prefix)) return null;
    const saved = loadState(channel.id);
    if (saved) return saved;
    try { return JSON.parse(channel.topic.slice(prefix.length)); } catch { return null; }
}

async function saveTicket(channel, data) {
    saveState(channel.id, data);
}

function controls(data) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket:claim').setLabel('Handle Ticket')
            .setStyle(ButtonStyle.Primary).setDisabled(Boolean(data.claimant || data.closeAt)),
        new ButtonBuilder().setCustomId('ticket:release').setLabel('Release Ticket')
            .setStyle(ButtonStyle.Secondary).setDisabled(Boolean(!data.claimant || data.closeAt)),
        new ButtonBuilder().setCustomId('ticket:add').setLabel('Add Member').setStyle(ButtonStyle.Secondary).setDisabled(Boolean(data.closeAt)),
        new ButtonBuilder().setCustomId('ticket:category').setLabel('Change Category').setStyle(ButtonStyle.Secondary).setDisabled(Boolean(data.closeAt || (data.categoryChanges || 0) >= 3)),
        new ButtonBuilder().setCustomId('ticket:close').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setDisabled(Boolean(data.closeAt)),
    );
}

function input(id, label, style, placeholder, max, min = 1) {
    return new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label)
        .setStyle(style).setPlaceholder(placeholder).setRequired(true).setMinLength(min).setMaxLength(max));
}

async function staffMember(interaction, system) {
    const roles = interaction.member?.roles;
    return system.tickets.staffRoleIds.some(id => Array.isArray(roles) ? roles.includes(id) : Boolean(roles?.cache?.has(id)));
}

async function updateTicketMessage(channel, data) {
    const message = await channel.messages.fetch(data.message);
    const embed = EmbedBuilder.from(message.embeds[0]);
    embed.setTitle(`${types[data.type].label} • Support Ticket`);
    const fields = embed.data.fields.filter(field => !['Assigned leader', 'Status'].includes(field.name))
        .map(field => field.name === 'Category' ? { ...field, value: types[data.type].label } : field);
    embed.setFields(...fields,
        { name: 'Assigned leader', value: data.claimant ? `This ticket is being handled by <@${data.claimant}>.` : 'Waiting for a club leader.' },
        { name: 'Status', value: data.closeAt ? 'Closing — saving transcript.' : 'Open' },
    );
    await message.edit({ embeds: [embed], components: [controls(data)], allowedMentions: { parse: [] } });
}

async function finishClose(channel, system) {
    if (channelLocks.has(channel.id)) {
        const timer = setTimeout(() => finishClose(channel, system), 1000);
        timer.unref();
        closeTimers.set(channel.id, timer);
        return;
    }
    channelLocks.add(channel.id);
    try {
        const data = readTicket(channel);
        if (!data?.closeAt) return;
        await archiveTicket(channel, data, system, () => saveTicket(channel, data));
        await channel.delete(`Ticket closed by ${data.closer}; transcript saved.`);
        removeState(channel.id);
    } catch (error) {
        console.error('[TICKETS] Could not archive or close ticket:', error.message);
        const data = readTicket(channel);
        if (data) {
            delete data.closeAt;
            delete data.logThread;
            delete data.logProgress;
            delete data.snapshotBefore;
            await saveTicket(channel, data).catch(error => console.error('[TICKETS]', error.message));
            await updateTicketMessage(channel, data).catch(error => console.error('[TICKETS]', error.message));
            await channel.send({ content: 'The ticket could not be closed safely. The channel has been kept open. Please check the ticket log channel and bot permissions, then try again.', allowedMentions: { parse: [] } })
                .catch(error => console.error('[TICKETS]', error.message));
        }
    } finally {
        channelLocks.delete(channel.id);
        closeTimers.delete(channel.id);
    }
}

function scheduleClose(channel, data, system) {
    if (closeTimers.has(channel.id)) return;
    const timer = setTimeout(() => finishClose(channel, system), Math.max(0, data.closeAt - Date.now()));
    timer.unref();
    closeTimers.set(channel.id, timer);
}

async function openTicket(interaction, type, system) {
    if (!types[type]) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const key = `${interaction.guildId}:${interaction.user.id}`;
    if (opening.has(key)) return interaction.editReply('Your ticket is already being created.');
    opening.add(key);
    let channel;
    let initialized = false;
    try {
        const notice = cooldownNotice(interaction.guildId, interaction.user.id);
        if (notice) return interaction.editReply(notice);
        const name = interaction.fields.getTextInputValue('name').trim();
        const student = interaction.fields.getTextInputValue('student').trim();
        const reason = interaction.fields.getTextInputValue('reason').trim();
        if (!name || !reason || !/^\d{9}$/.test(student)) {
            return interaction.editReply('Enter your name, a student ID containing exactly 9 digits, and a reason.');
        }
        const channels = await interaction.guild.channels.fetch();
        const existing = channels.find(c => readTicket(c)?.owner === interaction.user.id);
        if (existing) return interaction.editReply(`You already have an open ticket: <#${existing.id}>.`);
        const category = channels.get(system.tickets.categoryId);
        const logs = channels.get(system.tickets.logChannelId);
        if (category?.type !== ChannelType.GuildCategory || logs?.type !== ChannelType.GuildText || !system.tickets.staffRoleIds.length) {
            return interaction.editReply('Ticket settings are incomplete. Please contact a club leader.');
        }
        const roles = await interaction.guild.roles.fetch();
        if (system.tickets.staffRoleIds.some(id => !roles.has(id) || id === interaction.guildId)) {
            return interaction.editReply('A support role is missing or invalid. Please contact a club leader.');
        }
        const bot = await interaction.guild.members.fetchMe();
        if (!logs.permissionsFor(bot).has([
            PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.SendMessagesInThreads,
            PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks,
        ])) return interaction.editReply('The bot cannot save ticket logs. Please contact a club leader.');
        const access = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];
        const data = { owner: interaction.user.id, type, student, claimant: null, createdAt: Date.now() };
        channel = await interaction.guild.channels.create({
            name: `ticket-${student.toLowerCase()}`, type: ChannelType.GuildText, parent: category.id,
            topic: prefix + JSON.stringify(data),
            permissionOverwrites: [
                { id: interaction.guildId, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: access },
                { id: interaction.client.user.id, allow: [...access, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles] },
                ...system.tickets.staffRoleIds.map(id => ({ id, allow: access })),
            ],
            reason: `${types[type].label} ticket requested by ${interaction.user.id}`,
        });
        const embed = new EmbedBuilder().setColor(0xd8c7a3).setTitle(`${types[type].label} • Support Ticket`)
            .setDescription('A club leader will assist you here. Please share any extra details or evidence in this channel.')
            .addFields(
                { name: 'Member', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Name', value: name, inline: true },
                { name: 'Student ID', value: student, inline: true },
                { name: 'Category', value: types[type].label },
                { name: 'Reason / Details', value: reason },
                { name: 'Assigned leader', value: 'Waiting for a club leader.' },
                { name: 'Status', value: 'Open' },
            ).setTimestamp();
        const message = await channel.send({
            content: system.tickets.staffRoleIds.map(id => `<@&${id}>`).join(' '),
            allowedMentions: { roles: system.tickets.staffRoleIds, parse: [] },
            embeds: [embed], components: [controls(data)],
        });
        data.message = message.id;
        await saveTicket(channel, data);
        recordTicketOpen(interaction.guildId, interaction.user.id);
        initialized = true;
        await interaction.editReply(`Your private ticket is ready: <#${channel.id}>.`);
    } catch (error) {
        if (channel && !initialized) await channel.delete('Ticket setup failed.').then(() => removeState(channel.id)).catch(() => {});
        throw error;
    } finally { opening.delete(key); }
}

async function handleTicketInteraction(interaction, system) {
    if (!interaction.inGuild() || interaction.guildId !== system.guildId) return;
    if ((!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isStringSelectMenu?.()) || !interaction.customId.startsWith('ticket:')) return;
    try {
        if (interaction.customId.startsWith('ticket:open:')) {
            const type = interaction.customId.split(':')[2];
            if (!types[type]) return;
            const notice = cooldownNotice(interaction.guildId, interaction.user.id);
            if (notice) return await interaction.reply({ content: notice, flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder().setCustomId(`ticket:submit:${type}`).setTitle(types[type].label)
                .addComponents(
                    input('name', 'Your name', TextInputStyle.Short, 'Enter your full name', 100),
                    input('student', 'Student ID', TextInputStyle.Short, 'Enter your 9-digit student ID', 9, 9),
                    input('reason', type === 'report' ? 'Problem details' : type === 'roles' ? 'Role / skill request and proof' : 'Your question', TextInputStyle.Paragraph, types[type].prompt, 1000),
                );
            return await interaction.showModal(modal);
        }
        if (interaction.customId.startsWith('ticket:submit:')) {
            return await openTicket(interaction, interaction.customId.split(':')[2], system);
        }
        const opensModal = interaction.customId === 'ticket:add';
        if (!opensModal) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const respond = content => opensModal
            ? interaction.reply({ content, flags: MessageFlags.Ephemeral })
            : interaction.editReply({ content });
        if (!readTicket(interaction.channel)) return await respond('This is not an active ticket channel.');
        if (!await staffMember(interaction, system, opensModal)) {
            return await respond('Only club leaders can manage tickets.');
        }
        if (opensModal) {
            if (readTicket(interaction.channel).closeAt) return await respond('This ticket is closing.');
            return await interaction.showModal(new ModalBuilder().setCustomId('ticket:add-submit').setTitle('Add Member to Ticket')
                .addComponents(input('member', 'Discord user ID', TextInputStyle.Short, 'Enter the member’s Discord user ID', 20)));
        }
        const channel = interaction.channel;
        if (channelLocks.has(channel.id)) return interaction.editReply('Another ticket action is in progress. Please try again.');
        channelLocks.add(channel.id);
        try {
            const data = readTicket(channel);
            if (!data || data.closeAt) return interaction.editReply('This ticket is already closing.');
            if (['ticket:category', 'ticket:category-submit'].includes(interaction.customId)) {
                if ((data.categoryChanges || 0) >= 3) return interaction.editReply({
                    content: 'This ticket has reached its limit of 3 category changes.', components: [],
                });
                const remaining = (data.categoryChangedAt || 0) + 10000 - Date.now();
                if (remaining > 0) return interaction.editReply({
                    content: `Please wait ${Math.ceil(remaining / 1000)} seconds before changing this ticket category again.`, components: [],
                });
            }
            if (interaction.customId === 'ticket:category') {
                const menu = new StringSelectMenuBuilder().setCustomId('ticket:category-submit')
                    .setPlaceholder('Choose the correct ticket category').setMinValues(1).setMaxValues(1)
                    .addOptions(Object.entries(types).map(([value, type]) => ({
                        label: type.label, value, emoji: type.emoji, default: data.type === value,
                    })));
                return interaction.editReply({
                    content: `Select the correct category for this ticket (${3 - (data.categoryChanges || 0)} changes remaining):`,
                    components: [new ActionRowBuilder().addComponents(menu)],
                });
            }
            if (interaction.customId === 'ticket:category-submit') {
                const type = interaction.values?.[0];
                if (!types[type]) return interaction.editReply({ content: 'Choose a valid ticket category.', components: [] });
                if (data.type === type) return interaction.editReply({ content: 'This ticket already belongs to that category.', components: [] });
                const previous = data.type;
                const previousCount = data.categoryChanges || 0;
                const previousTime = data.categoryChangedAt || 0;
                data.type = type;
                data.categoryChanges = previousCount + 1;
                data.categoryChangedAt = Date.now();
                await saveTicket(channel, data);
                try {
                    await updateTicketMessage(channel, data);
                } catch (error) {
                    data.type = previous;
                    data.categoryChanges = previousCount;
                    data.categoryChangedAt = previousTime;
                    await saveTicket(channel, data);
                    throw error;
                }
                await channel.send({
                    content: `Ticket category changed from **${types[previous].label}** to **${types[type].label}** by <@${interaction.user.id}>.`,
                    allowedMentions: { parse: [] },
                });
                return interaction.editReply({ content: `Ticket category updated to ${types[type].label}. ${3 - data.categoryChanges} changes remaining.`, components: [] });
            }
            if (interaction.customId === 'ticket:claim') {
                if (data.claimant) return interaction.editReply(`This ticket is already being handled by <@${data.claimant}>.`);
                data.claimant = interaction.user.id;
                await saveTicket(channel, data);
                await updateTicketMessage(channel, data);
                return interaction.editReply('You are now handling this ticket.');
            }
            if (interaction.customId === 'ticket:release') {
                if (!data.claimant) return interaction.editReply('This ticket is not being handled by anyone.');
                if (data.claimant !== interaction.user.id) return interaction.editReply('Only the leader handling this ticket can release it.');
                data.claimant = null;
                await saveTicket(channel, data);
                await updateTicketMessage(channel, data);
                return interaction.editReply('You released this ticket. Another club leader can now handle it.');
            }
            if (interaction.customId === 'ticket:add-submit') {
                const id = interaction.fields.getTextInputValue('member').trim();
                if (!/^\d{17,20}$/.test(id)) return interaction.editReply('Enter a valid Discord user ID.');
                const member = await interaction.guild.members.fetch(id).catch(() => null);
                if (!member) return interaction.editReply('That user is not a member of this server.');
                if (channel.permissionsFor(member).has(PermissionFlagsBits.ViewChannel)) return interaction.editReply('This member already has access to the ticket.');
                await channel.permissionOverwrites.edit(id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true });
                await channel.send({ content: `<@${id}> was added to the ticket by <@${interaction.user.id}>.`, allowedMentions: { users: [id], parse: [] } });
                return interaction.editReply('Member added to the ticket.');
            }
            if (interaction.customId === 'ticket:close') {
                data.closeAt = Date.now() + 5000;
                data.closer = interaction.user.id;
                await saveTicket(channel, data);
                scheduleClose(channel, data, system);
                await updateTicketMessage(channel, data);
                await channel.send({ content: 'This ticket will close in 5 seconds. The conversation will be saved in the ticket logs before the channel is deleted.', allowedMentions: { parse: [] } });
                return interaction.editReply('Ticket closure scheduled.');
            }
            await interaction.editReply('Unknown ticket action.');
        } finally { channelLocks.delete(channel.id); }
    } catch (error) {
        console.error('[TICKETS]', error.message);
        const content = 'The ticket action failed. Please check bot permissions or contact a club leader.';
        if (interaction.deferred || interaction.replied) await interaction.editReply({ content }).catch(() => {});
        else await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
}

function registerTickets(client, system) {
    client.on(Events.InteractionCreate, interaction => handleTicketInteraction(interaction, system));
    client.once(Events.ClientReady, async () => {
        try {
            const guild = client.guilds.cache.get(system.guildId);
            if (!guild) return;
            const channels = await guild.channels.fetch();
            for (const channel of channels.values()) {
                const data = readTicket(channel);
                if (data?.closeAt) scheduleClose(channel, data, system);
                else if (data?.message) await updateTicketMessage(channel, data)
                    .catch(error => console.error('[TICKETS] Could not refresh ticket controls:', error.message));
            }
        } catch (error) { console.error('[TICKETS] Recovery failed:', error.message); }
    });
}

module.exports = { registerTickets, handleTicketInteraction, readTicket, controls };
