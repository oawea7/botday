import fs from 'fs';
import express from 'express';
import fetch from 'node-fetch';
import { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events } from 'discord.js';
import { config } from 'dotenv';

config();

const app = express();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// --- CONFIG ---
const CONFIG = {
    guildId: '1402400197040013322',
    ticketCategoryId: '1437139682361344030',
    roles: {
        pr: '1402416210779312249',
        sm: '1402416194354544753',
        mod: '1402411949593202800',
        leadership: '1402400285674049576',
        support: '1402417889826443356',
        specialUser: '1107787991444881408'
    },
    transcriptsChannelId: '1437112357787533436',
    supportImage: 'https://cdn.discordapp.com/attachments/1402405357812187287/1403398794695016470/support3.png',
    emojis: {
        general: '<:c_flower:1437125663231315988>',
        pr: '<:flower_yellow:1437121213796188221>',
        sm: '<:flower_pink:1437121075086622903>',
        mod: '<:flower_blue:1415086940306276424>',
        leadership: '<:flower_green:1437121005821759688>'
    },
    bloxlinkGroupId: '250548768'
};

// --- CLIENT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// --- TICKET DATA ---
const ticketDataPath = './ticketData.json';
let ticketData = { ticketCounter: 1, pausedCategories: {}, pausedSubtopics: {}, activeTickets: {} };
if (fs.existsSync(ticketDataPath)) ticketData = JSON.parse(fs.readFileSync(ticketDataPath, 'utf-8'));

// --- HELPERS ---
function saveTicketData() {
    fs.writeFileSync(ticketDataPath, JSON.stringify(ticketData, null, 2));
}

async function getRobloxHeadshot(discordId) {
    try {
        const res = await fetch(`https://api.blox.link/v1/user/${discordId}`);
        const data = await res.json();
        if (!data.primaryAccount || !data.primaryAccount.id) return null;
        const robloxId = data.primaryAccount.id;
        return `https://www.roblox.com/headshot-thumbnail/image?userId=${robloxId}&width=150&height=150&format=png`;
    } catch {
        return null;
    }
}

// Create ticket buttons with emojis
function createTicketButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_pr').setLabel(`${CONFIG.emojis.pr} Public Relations`).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_sm').setLabel(`${CONFIG.emojis.sm} Staff Management`).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_mod').setLabel(`${CONFIG.emojis.mod} Moderation`).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket_leadership').setLabel(`${CONFIG.emojis.leadership} Leadership`).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_general').setLabel(`${CONFIG.emojis.general} General Support`).setStyle(ButtonStyle.Success)
    );
}

// --- EVENTS ---
client.on(Events.ClientReady, () => console.log(`Logged in as ${client.user.tag}`));

// Handle ticket button interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;
    const { customId, user, guild } = interaction;
    if (guild.id !== CONFIG.guildId) return;

    const typeMap = {
        ticket_pr: 'pr',
        ticket_sm: 'sm',
        ticket_mod: 'mod',
        ticket_leadership: 'leadership',
        ticket_general: 'support'
    };
    const type = typeMap[customId];
    if (!type) return;

    // Create ticket channel
    const channel = await guild.channels.create({
        name: `ticket-${ticketData.ticketCounter}`,
        type: 0,
        parent: CONFIG.ticketCategoryId,
        permissionOverwrites: [
            { id: guild.roles.everyone, deny: ['ViewChannel'] },
            { id: user.id, allow: ['ViewChannel', 'SendMessages', 'AttachFiles', 'ReadMessageHistory'] },
            { id: CONFIG.roles[type], allow: ['ViewChannel', 'SendMessages', 'ManageChannels', 'ReadMessageHistory'] }
        ]
    });

    ticketData.activeTickets[channel.id] = { userId: user.id, type, createdAt: Date.now() };
    ticketData.ticketCounter++;
    saveTicketData();

    const robloxHeadshot = await getRobloxHeadshot(user.id);

    const embed = new EmbedBuilder()
        .setTitle(`🎫 ${interaction.component.label} Ticket`)
        .setDescription(`Hello ${user}, a staff member will be with you shortly.`)
        .setColor('#00FFFF')
        .setImage(CONFIG.supportImage)
        .setThumbnail(robloxHeadshot || user.displayAvatarURL())
        .setFooter({ text: 'Adalea Bots' });

    const ticketButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
    );

    await channel.send({ content: `<@${user.id}>`, embeds: [embed], components: [ticketButtons] });
    await interaction.reply({ content: `Ticket created: <#${channel.id}>`, ephemeral: true });
});

// Handle claim & close buttons
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;
    const { customId, channel, user } = interaction;

    const ticket = ticketData.activeTickets[channel.id];
    if (!ticket) return interaction.reply({ content: 'Not a ticket channel.', ephemeral: true });

    if (customId === 'claim_ticket') {
        await channel.send({ content: `${user} will be handling this ticket!` });
    }

    if (customId === 'close_ticket') {
        const transcriptChannel = await client.channels.fetch(CONFIG.transcriptsChannelId);
        const transcriptFile = `Ticket by <@${ticket.userId}> closed at ${new Date().toLocaleString()}`;
        const transcriptTxtPath = `./transcripts/ticket-${channel.id}.txt`;

        fs.mkdirSync('./transcripts', { recursive: true });
        fs.writeFileSync(transcriptTxtPath, transcriptFile);

        const embed = new EmbedBuilder()
            .setTitle('Ticket Transcript')
            .setDescription(`Ticket by <@${ticket.userId}>\nCategory: ${ticket.type}\nCreated At: ${new Date(ticket.createdAt).toLocaleString()}\nClosed By: ${user.tag}`)
            .setColor('#00FFFF')
            .setFooter({ text: 'Adalea Bots' });

        await transcriptChannel.send({ embeds: [embed], files: [transcriptTxtPath] });

        delete ticketData.activeTickets[channel.id];
        saveTicketData();
        await channel.delete();
    }
});

// Handle prefix commands: ?supportpanel, ?startcat, ?stopcat, ?start, ?stop
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith('?')) return;

    const args = message.content.slice(1).split(/ +/);
    const command = args.shift().toLowerCase();

    // support panel
    if (command === 'supportpanel') {
        const embed = new EmbedBuilder()
            .setTitle('🎫 Support Panel')
            .setDescription('Click a button below to open a ticket.')
            .setColor('#00FFFF')
            .setImage(CONFIG.supportImage);

        await message.channel.send({ embeds: [embed], components: [createTicketButtons()] });
    }

    // category/subtopic start & stop commands
    if (command === 'stopcat') {
        const cat = args[0];
        if (CONFIG.roles[cat]) {
            ticketData.pausedCategories[cat] = true;
            saveTicketData();
            return message.reply(`Category ${cat} is now paused.`);
        }
    }

    if (command === 'startcat') {
        const cat = args[0];
        if (CONFIG.roles[cat]) {
            ticketData.pausedCategories[cat] = false;
            saveTicketData();
            return message.reply(`Category ${cat} is now active.`);
        }
    }

    if (command === 'stop') {
        const sub = args[0];
        ticketData.pausedSubtopics[sub] = true;
        saveTicketData();
        return message.reply(`Subtopic ${sub} is now paused.`);
    }

    if (command === 'start') {
        const sub = args[0];
        ticketData.pausedSubtopics[sub] = false;
        saveTicketData();
        return message.reply(`Subtopic ${sub} is now active.`);
    }
});

// --- DEPLOY ---
client.login(process.env.BOT_TOKEN_1);

