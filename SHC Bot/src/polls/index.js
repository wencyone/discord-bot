const { Events, SlashCommandBuilder, MessageFlags, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const { createPollCard } = require('./card');
const { savePoll, removePoll } = require('./state');
const { scheduleEnd, handleVote, restorePolls, voteButtons } = require('./voting');

const command = new SlashCommandBuilder().setName('poll').setDescription('Create a Canvas poll with emoji voting.')
    .addStringOption(option => option.setName('message').setDescription('The question to ask the community.')
        .setRequired(true).setMinLength(1).setMaxLength(300))
    .addNumberOption(option => option.setName('hours').setDescription('Voting duration in hours (for example: 1, 2 or 0.5).')
        .setRequired(true).setMinValue(0.01).setMaxValue(8760));

async function handlePoll(interaction, system) {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'poll') return;
    if (!interaction.inGuild() || interaction.guildId !== system.guildId) return;
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const roles = interaction.member?.roles;
        const staff = system.tickets.staffRoleIds.some(id => Array.isArray(roles) ? roles.includes(id) : Boolean(roles?.cache?.has(id)));
        if (!staff) return await interaction.editReply('Only club leaders can create polls.');
        const question = interaction.options.getString('message', true).trim();
        const hours = interaction.options.getNumber('hours', true);
        if (!question || question.length > 300 || !Number.isFinite(hours) || hours < 0.01 || hours > 8760) {
            return await interaction.editReply('Enter a question containing 1–300 characters and a duration between 0.01 and 8760 hours.');
        }
        const channel = interaction.channel;
        if (!channel?.isTextBased() || typeof channel.send !== 'function') return await interaction.editReply('Use this command in a server text channel.');
        const bot = await interaction.guild.members.fetchMe();
        const required = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.MentionEveryone,
            PermissionFlagsBits.ReadMessageHistory];
        required.push(channel.isThread() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages);
        if (!channel.permissionsFor(bot)?.has(required)) return await interaction.editReply('The bot needs View Channel, Send Messages, Attach Files, Read Message History and Mention Everyone permissions.');
        const results = await interaction.guild.channels.fetch(system.polls.resultsChannelId);
        if (!results?.isTextBased() || typeof results.send !== 'function' || !results.permissionsFor(bot)?.has([
            PermissionFlagsBits.ViewChannel, PermissionFlagsBits.AttachFiles,
            results.isThread() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages,
        ])) return await interaction.editReply('The bot cannot send images to the configured poll results channel.');
        const author = interaction.member.displayName || interaction.user.globalName || interaction.user.username;
        const endsAt = Date.now() + Math.round(hours * 3600000);
        const card = await createPollCard(question, author, { endsAt });
        const message = await channel.send({
            content: '@everyone', allowedMentions: { parse: ['everyone'], users: [], roles: [] },
            files: [new AttachmentBuilder(card, { name: 'community-poll.png' })], components: [voteButtons()],
        });
        const data = { id: message.id, guildId: interaction.guildId, channelId: channel.id,
            resultsChannelId: system.polls.resultsChannelId, question, author, endsAt, status: 'open', votes: {} };
        try {
            savePoll(data);
        } catch (error) {
            await message.delete().then(() => removePoll(message.id)).catch(cleanupError => console.error('[POLLS] Cleanup failed:', cleanupError.message));
            throw error;
        }
        scheduleEnd(interaction.client, data);
        await interaction.editReply(`Poll created: ${message.url}\nVoting ends <t:${Math.floor(endsAt / 1000)}:R>.`);
    } catch (error) {
        console.error('[POLLS]', error.message);
        if (interaction.deferred || interaction.replied) await interaction.editReply('The poll could not be created. Please check bot permissions and try again.').catch(() => {});
        else await interaction.reply({ content: 'The poll could not be created. Please try again.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
}

function registerPolls(client, system) {
    client.on(Events.InteractionCreate, interaction => handlePoll(interaction, system));
    client.on(Events.InteractionCreate, interaction => handleVote(interaction, system));
    client.once(Events.ClientReady, async () => {
        try {
            const guild = client.guilds.cache.get(system.guildId);
            if (guild) await guild.commands.create(command.toJSON());
            await restorePolls(client, system);
        } catch (error) { console.error('[POLLS] Setup failed:', error.message); }
    });
}

module.exports = { registerPolls, handlePoll, command };
