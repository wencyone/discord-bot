const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('node:path');

async function createLeaveCard(member) {
    const canvas = createCanvas(1200, 460);
    const ctx = canvas.getContext('2d');
    const green = '#1e2e28';
    const beige = '#d8c7a3';
    ctx.fillStyle = green;
    ctx.fillRect(0, 0, 1200, 460);

    ctx.strokeStyle = '#405248';
    ctx.lineWidth = 1;
    ctx.strokeRect(22.5, 22.5, 1155, 415);
    ctx.fillStyle = beige;
    ctx.fillRect(23, 23, 5, 414);

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = beige;
    for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(1170, 445, 130 + i * 65, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();

    const logo = await loadImage(path.join(__dirname, '../assets/club-logo.png'));
    ctx.drawImage(logo, 54, 42, 94, 94);
    ctx.fillStyle = beige;
    ctx.font = 'bold 18px Arial';
    ctx.fillText('SSF  /  THE COMMUNITY', 158, 96);
    ctx.fillStyle = '#9cac9f';
    ctx.font = '14px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('UNTIL NEXT TIME', 1136, 96);
    ctx.textAlign = 'left';

    let avatar;
    try {
        const response = await fetch(member.displayAvatarURL({ extension: 'png', size: 256 }), {
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error(`Avatar HTTP ${response.status}`);
        avatar = await loadImage(Buffer.from(await response.arrayBuffer()));
    } catch {
        avatar = logo;
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(164, 257, 79, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, 85, 178, 158, 158);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(164, 257, 86, 0, Math.PI * 2);
    ctx.strokeStyle = beige;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = beige;
    ctx.font = 'bold 16px Arial';
    ctx.fillText('A MEMBER HAS LEFT', 290, 185);
    const name = member.displayName || member.user.globalName || member.user.username;
    let fontSize = 52;
    do {
        ctx.font = `bold ${fontSize}px Arial`;
        if (ctx.measureText(name).width <= 820) break;
        fontSize--;
    } while (fontSize > 20);
    ctx.fillText(name, 286, 252, 820);
    ctx.fillStyle = '#b5c0b7';
    ctx.font = '22px Arial';
    ctx.fillText('Thank you for being part of our community.', 290, 300);

    ctx.fillStyle = '#34483c';
    ctx.fillRect(290, 331, 240, 40);
    ctx.fillStyle = beige;
    ctx.font = 'bold 15px Arial';
    ctx.fillText(`${member.guild.memberCount.toLocaleString('en-US')} MEMBERS REMAIN`, 307, 357);
    ctx.fillStyle = '#9cac9f';
    ctx.font = '14px Arial';
    ctx.fillText('THE CLUB WILL REMEMBER YOU.', 78, 412);
    ctx.textAlign = 'right';
    ctx.fillText('Wishing you all the best.', 1136, 412);

    return canvas.encode('png');
}

module.exports = { createLeaveCard };
