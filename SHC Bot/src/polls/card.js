const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('node:path');

function wrapText(ctx, text, width) {
    const lines = [];
    for (const paragraph of text.split('\n')) {
        let line = '';
        for (const character of paragraph) {
            if (line && ctx.measureText(line + character).width > width) {
                lines.push(line.trimEnd());
                line = '';
            }
            line += character;
        }
        lines.push(line.trimEnd());
    }
    return lines;
}

async function createPollCard(question, author, options = {}) {
    const { total = 0, ended = false, yes = 0, no = 0, endsAt } = options;
    const canvas = createCanvas(1200, 460);
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 38px Arial';
    const lines = wrapText(ctx, question, 1030);
    const questionBottom = 216 + (lines.length - 1) * 51;
    const height = questionBottom + (ended ? 255 : 212);
    canvas.height = height;
    ctx.fillStyle = '#1e2e28';
    ctx.fillRect(0, 0, 1200, height);
    ctx.strokeStyle = '#405248';
    ctx.strokeRect(24.5, 24.5, 1151, height - 49);
    ctx.fillStyle = '#d8c7a3';
    ctx.fillRect(24, 24, 5, height - 48);
    const logo = await loadImage(path.join(__dirname, '../../assets/club-logo.png'));
    ctx.drawImage(logo, 55, 38, 86, 86);
    ctx.font = 'bold 18px Arial';
    ctx.fillText('SSF  /  COMMUNITY POLL', 152, 89);
    ctx.textAlign = 'right';
    ctx.font = '16px Arial';
    ctx.fillText(ended ? 'VOTING HAS ENDED' : 'YOUR VOICE MATTERS', 1120, 89);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9cac9f';
    ctx.font = 'bold 15px Arial';
    ctx.fillText(ended ? 'FINAL RESULTS' : 'LET US KNOW WHAT YOU THINK', 80, 158);
    ctx.fillStyle = '#d8c7a3';
    ctx.font = 'bold 38px Arial';
    lines.forEach((line, i) => ctx.fillText(line, 78, 216 + i * 51));
    const y = questionBottom + 38;
    if (ended) {
        const yesPercent = total ? (yes / total * 100).toFixed(1) : '0.0';
        const noPercent = total ? (no / total * 100).toFixed(1) : '0.0';
        ctx.font = 'bold 27px Arial';
        ctx.fillText(`YES  ${yesPercent}%`, 80, y + 31);
        ctx.fillText(`NO  ${noPercent}%`, 635, y + 31);
        ctx.fillStyle = '#34483c';
        ctx.fillRect(80, y + 48, 485, 10);
        ctx.fillRect(635, y + 48, 485, 10);
        ctx.fillStyle = '#d8c7a3';
        ctx.fillRect(80, y + 48, 485 * Number(yesPercent) / 100, 10);
        ctx.fillRect(635, y + 48, 485 * Number(noPercent) / 100, 10);
    } else {
        ctx.fillStyle = '#293e33';
        ctx.fillRect(80, y, 220, 61);
        ctx.fillRect(320, y, 220, 61);
        ctx.fillStyle = '#d8c7a3';
        ctx.font = 'bold 25px Arial';
        ctx.fillText('YES', 140, y + 39);
        ctx.fillText('NO', 380, y + 39);
        ctx.strokeStyle = '#d8c7a3';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(103, y + 31); ctx.lineTo(112, y + 40); ctx.lineTo(128, y + 22); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(345, y + 23); ctx.lineTo(362, y + 40); ctx.moveTo(362, y + 23); ctx.lineTo(345, y + 40); ctx.stroke();
    }
    ctx.fillStyle = '#b5c0b7';
    ctx.font = 'bold 23px Arial';
    ctx.fillText(`${total.toLocaleString('en-US')} ${total === 1 ? 'vote' : 'votes'} cast`, 80, height - 84);
    ctx.textAlign = 'right';
    ctx.font = '17px Arial';
    ctx.fillText(ended ? 'Thank you for sharing your voice.' : 'Choose below to vote. Your latest choice counts.', 1120, height - 84);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9cac9f';
    ctx.font = '15px Arial';
    ctx.fillText(`Posted by ${author}`.slice(0, 100), 80, height - 45, 650);
    if (endsAt) {
        ctx.textAlign = 'right';
        const date = new Date(endsAt).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' });
        ctx.fillText(`${ended ? 'Ended' : 'Closes'}: ${date} UTC`, 1120, height - 45);
    }
    return canvas.encode('png');
}

module.exports = { createPollCard };
