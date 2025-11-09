import fs from 'fs';
import express from 'express';
import { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events, ChannelType } from 'discord.js';
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

// --- PANEL EMBED & BUTTONS ---
function createSupportPanelEmbed() {
    return new EmbedBuilder()
        .setTitle('🎫 Support Panel')
        .setDescription('Click a button below to open a ticket in the category you need help with.')
        .setColor('#00FFFF')
        .setImage(CONFIG.supportImage);
}

function createSupportPanelButtons() {
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

// Handle support panel button interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;
    if (interaction.guild.id !== CONFIG.guildId) return;

    const typeMap = {
        ticket_pr: 'pr',
        ticket_sm: 'sm',
        ticket_mod: 'mod',
        ticket_leadership: 'leadership',
        ticket_general: 'support'
    };
    const type = typeMap[interaction.customId];
    if (!type) return;

    // Check if category or subtopic is paused
    if (ticketData.pausedCategories[type] || ticketData.pausedSubtopics[type]) {
        return interaction.reply({ content: `This category is currently paused.`, ephemeral: true });
    }

    // Create ticket channel
    const channel = await interaction.guild.channels.create({
        name: `ticket-${ticketData.ticketCounter}`,
        type: ChannelType.GuildText,
        parent: CONFIG.ticketCategoryId,
        permissionOverwrites: [
            { id: interaction.guild.roles.everyone, deny: ['ViewChannel'] },
            { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles'] },
            { id: CONFIG.roles[type], allow: ['ViewChannel', 'SendMessages', 'ManageChannels', 'ReadMessageHistory'] }
        ]
    });

    ticketData.activeTickets[channel.id] = { userId: interaction.user.id, type, claimedBy: null, createdAt: Date.now() };
    ticketData.ticketCounter++;
    saveTicketData();

    // Send ticket embed with claim & close buttons
    const ticketEmbed = new EmbedBuilder()
        .setTitle(`🎫 ${interaction.component.label} Ticket`)
        .setDescription(`Hello <@${interaction.user.id}>, a staff member will be with you shortly.`)
        .setColor('#00FFFF');

    const ticketButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger)
    );

    await channel.send({ content: `<@${interaction.user.id}>`, embeds: [ticketEmbed], components: [ticketButtons] });
    await interaction.reply({ content: `Ticket created: <#${channel.id}>`, ephemeral: true });
});

// Handle ticket claim & close buttons
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;
    const ticket = ticketData.activeTickets[interaction.channel.id];
    if (!ticket) return;

    const staffRoles = Object.values(CONFIG.roles);
    if (!interaction.member.roles.cache.some(r => staffRoles.includes(r.id))) return interaction.reply({ content: 'Only staff can use this button.', ephemeral: true });

    if (interaction.customId === 'claim_ticket') {
        ticket.claimedBy = interaction.user.id;
        saveTicketData();
        return interaction.reply({ content: `Ticket claimed by <@${interaction.user.id}>`, ephemeral: true });
    }

    if (interaction.customId === 'close_ticket') {
        const transcriptChannel = await client.channels.fetch(CONFIG.transcriptsChannelId);
        const transcript = `Ticket by <@${ticket.userId}> (Type: ${ticket.type})\nClaimed by: ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Unclaimed'}\nClosed at: ${new Date().toLocaleString()}`;
        await transcriptChannel.send({ content: transcript });

        delete ticketData.activeTickets[interaction.channel.id];
        saveTicketData();
        return interaction.channel.delete();
    }
});

// Handle prefix commands
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith('?')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Support panel
    if (command === 'supportpanel') {
        const embed = createSupportPanelEmbed();
        const buttons = createSupportPanelButtons();
        return message.channel.send({ embeds: [embed], components: [buttons] });
    }

    // Category/subtopic pause/resume
    if (command === 'stopcat') {
        const cat = args[0];
        if (!cat) return message.reply('Specify category to stop.');
        ticketData.pausedCategories[cat] = true;
        saveTicketData();
        return message.reply(`Category ${cat} paused.`);
    }
    if (command === 'startcat') {
        const cat = args[0];
        if (!cat) return message.reply('Specify category to start.');
        ticketData.pausedCategories[cat] = false;
        saveTicketData();
        return message.reply(`Category ${cat} unpaused.`);
    }
    if (command === 'stop') {
        const sub = args[0];
        if (!sub) return message.reply('Specify subtopic to stop.');
        ticketData.pausedSubtopics[sub] = true;
        saveTicketData();
        return message.reply(`Subtopic ${sub} paused.`);
    }
    if (command === 'start') {
        const sub = args[0];
        if (!sub) return message.reply('Specify subtopic to start.');
        ticketData.pausedSubtopics[sub] = false;
        saveTicketData();
        return message.reply(`Subtopic ${sub} unpaused.`);
    }
});

// --- DEPLOY ---
client.login(process.env.BOT_TOKEN_1);

client.login(process.env.BOT_TOKEN_1);

