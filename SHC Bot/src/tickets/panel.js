const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const path = require('node:path');

const types = {
    report: { label: 'Report a Problem', emoji: '🚨', prompt: 'What happened? Include names and details.' },
    roles: { label: 'Roles & Skills', emoji: '🎭', prompt: 'Which role or skill? Include proof links.' },
    question: { label: 'General Question', emoji: '❓', prompt: 'What would you like to ask the leaders?' },
};

async function buildTicketPanel() {
    const canvas = createCanvas(1200, 760);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1e2e28';
    ctx.fillRect(0, 0, 1200, 760);
    ctx.strokeStyle = '#405248';
    ctx.strokeRect(24.5, 24.5, 1151, 711);
    ctx.fillStyle = '#d8c7a3';
    ctx.fillRect(24, 24, 5, 712);
    const logo = await loadImage(path.join(__dirname, '../../assets/club-logo.png'));
    ctx.drawImage(logo, 55, 44, 94, 94);
    ctx.font = 'bold 18px Arial';
    ctx.fillText('SSF  /  LEADER SUPPORT', 160, 99);
    ctx.font = 'bold 52px Arial';
    ctx.fillText('Support Tickets', 78, 207);
    ctx.fillStyle = '#b5c0b7';
    ctx.font = '23px Arial';
    ctx.fillText('Need help from the leaders? Pick a ticket type below.', 80, 255);
    ctx.fillText('Your ticket is private. Only you and the club leaders can see it.', 80, 292);
    const rows = [
        ['01', 'Report a Problem', 'Someone broke the rules. Let the leaders know.'],
        ['02', 'Roles & Skills', 'Become a Project Lead, fix a role, or submit skill proof.'],
        ['03', 'General Question', 'Anything else? We are here to help.'],
    ];
    rows.forEach(([number, title, description], i) => {
        const y = 335 + i * 102;
        ctx.fillStyle = '#293e33';
        ctx.fillRect(78, y, 1044, 88);
        ctx.fillStyle = '#d8c7a3';
        ctx.font = 'bold 22px Arial';
        ctx.fillText(number, 100, y + 51);
        ctx.fillText(title, 159, y + 34);
        ctx.fillStyle = '#b5c0b7';
        ctx.font = '20px Arial';
        ctx.fillText(description, 159, y + 65);
    });
    ctx.fillStyle = '#d8c7a3';
    ctx.font = '18px Arial';
    ctx.fillText("Please don't open tickets just to test. Thanks!", 80, 696);
    return {
        files: [new AttachmentBuilder(await canvas.encode('png'), { name: 'support-tickets.png' })],
        components: [new ActionRowBuilder().addComponents(Object.entries(types).map(([id, type]) =>
            new ButtonBuilder().setCustomId(`ticket:open:${id}`).setLabel(type.label).setEmoji(type.emoji).setStyle(ButtonStyle.Secondary)))],
        allowedMentions: { parse: [] },
    };
}

module.exports = { types, buildTicketPanel };
