const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { createPollCard } = require('./card');
const { loadPoll, savePoll, listPolls } = require('./state');

const queues = new Map();
const timers = new Map();
const refreshTimers = new Map();
const finishing = new Map();
function voteButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('poll:yes').setEmoji('✅').setLabel('Yes').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('poll:no').setEmoji('❌').setLabel('No').setStyle(ButtonStyle.Secondary),
    );
}

function totals(data) {
    const votes = Object.values(data.votes);
    const yes = votes.filter(value => value === 'yes').length;
    const no = votes.filter(value => value === 'no').length;
    return { yes, no, total: yes + no };
}

function enqueue(id, action) {
    const previous = queues.get(id) || Promise.resolve();
    const next = previous.catch(() => {}).then(action);
    queues.set(id, next);
    const cleanup = () => { if (queues.get(id) === next) queues.delete(id); };
    next.then(cleanup, error => { cleanup(); console.error('[POLLS]', error.message); });
    return next;
}

async function getMessage(client, data) {
    const channel = await client.channels.fetch(data.channelId);
    if (!channel || channel.guildId !== data.guildId) throw new Error('Poll channel is unavailable.');
    return channel.messages.fetch(data.id);
}

async function editCard(message, data, ended = false) {
    const image = await createPollCard(data.question, data.author, { ...totals(data), endsAt: data.endsAt, ended });
    await message.edit({
        attachments: [], files: [new AttachmentBuilder(image, { name: 'community-poll.png' })],
        allowedMentions: { parse: [] }, components: ended ? [] : [voteButtons()],
    });
}

function scheduleRefresh(client, id) {
    if (refreshTimers.has(id)) return;
    const timer = setTimeout(() => {
        refreshTimers.delete(id);
        enqueue(id, async () => {
            const data = loadPoll(id);
            if (!data || data.status !== 'open' || Date.now() >= data.endsAt) return;
            const message = await getMessage(client, data);
            await editCard(message, data);
        });
    }, 3000);
    timer.unref();
    refreshTimers.set(id, timer);
}

async function finishPoll(client, id) {
    const data = loadPoll(id);
    if (!data || data.status === 'ended') return;
    try {
        const message = await getMessage(client, data);
        if (data.status === 'open') {
            data.status = 'ending';
            savePoll(data);
        }
        const results = await client.channels.fetch(data.resultsChannelId);
        if (!results?.isTextBased() || typeof results.send !== 'function' || results.guildId !== data.guildId) throw new Error('Poll result channel is unavailable.');
        if (!data.resultsMessageId) {
            const image = await createPollCard(data.question, data.author, { ...totals(data), endsAt: data.endsAt, ended: true });
            const result = await results.send({
                content: `**Poll Results**\nhttps://discord.com/channels/${data.guildId}/${data.channelId}/${data.id}`,
                files: [new AttachmentBuilder(image, { name: 'poll-results.png' })],
                allowedMentions: { parse: [] },
            });
            data.resultsMessageId = result.id;
            savePoll(data);
        }
        await editCard(message, data, true);
        data.status = 'ended';
        savePoll(data);
    } catch (error) {
        console.error('[POLLS] Could not finish poll; retrying in 60 seconds:', error.message);
        const timer = setTimeout(() => enqueue(id, () => endPoll(client, id)), 60000);
        timer.unref();
        timers.set(id, timer);
    }
}

function endPoll(client, id) {
    if (finishing.has(id)) return finishing.get(id);
    const pending = finishPoll(client, id).finally(() => finishing.delete(id));
    finishing.set(id, pending);
    return pending;
}

function scheduleEnd(client, data) {
    clearTimeout(timers.get(data.id));
    const delay = Math.max(0, Math.min(data.endsAt - Date.now(), 2147483647));
    const timer = setTimeout(() => {
        timers.delete(data.id);
        const current = loadPoll(data.id);
        if (!current || current.status === 'ended') return;
        if (current.endsAt > Date.now() && current.status === 'open') scheduleEnd(client, current);
        else enqueue(data.id, () => endPoll(client, data.id));
    }, delay);
    timer.unref();
    timers.set(data.id, timer);
}

async function handleVote(interaction, system) {
    if (!interaction.isButton() || !['poll:yes', 'poll:no'].includes(interaction.customId)) return;
    if (!interaction.inGuild() || interaction.guildId !== system.guildId || interaction.user.bot) return;
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await enqueue(interaction.message.id, async () => {
            const data = loadPoll(interaction.message.id);
            if (!data || data.guildId !== interaction.guildId || data.channelId !== interaction.channelId) {
                return interaction.editReply('This poll is unavailable.');
            }
            if (data.status !== 'open' || Date.now() >= data.endsAt) {
                if (data.status !== 'ended') scheduleEnd(interaction.client, data);
                return interaction.editReply('Voting has ended for this poll.');
            }
            const choice = interaction.customId === 'poll:yes' ? 'yes' : 'no';
            if (data.votes[interaction.user.id] === choice) return interaction.editReply('Your vote has already been counted.');
            data.votes[interaction.user.id] = choice;
            savePoll(data);
            scheduleRefresh(interaction.client, data.id);
            await interaction.editReply('Your vote has been recorded. You can change it until voting ends.');
        });
    } catch (error) {
        console.error('[POLLS] Vote failed:', error.message);
        if (interaction.deferred || interaction.replied) await interaction.editReply('Your vote could not be processed. Please try again.').catch(() => {});
    }
}

async function restorePolls(client, system) {
    for (const data of listPolls()) {
        if (data.guildId !== system.guildId || data.status === 'ended') continue;
        try {
            if (data.status === 'open' && data.endsAt > Date.now()) {
                await enqueue(data.id, async () => {
                    const current = loadPoll(data.id);
                    const message = await getMessage(client, current);
                    await editCard(message, current);
                });
            }
        } catch (error) { console.error('[POLLS] Recovery failed:', error.message); }
        scheduleEnd(client, data);
    }
}

module.exports = { totals, scheduleEnd, handleVote, restorePolls, endPoll, voteButtons };
