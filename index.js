import fs from 'fs';
import express from 'express';
import { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events } from 'discord.js';
import { config } from 'dotenv';

config();

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running.'));
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

function createSupportPanel(user) {
    const embed = new EmbedBuilder()
        .setTitle('🎫 Support Panel')
        .setDescription(
            `${CONFIG.emojis.general} **General Support**\n` +
            `${CONFIG.emojis.pr} **Public Relations**\n` +
            `${CONFIG.emojis.sm} **Staff Management**\n` +
            `${CONFIG.emojis.mod} **Moderation**\n` +
            `${CONFIG.emojis.leadership} **Leadership**\n\n` +
            `Click a button below to open a ticket.`
        )
        .setColor('#00FFFF')
        .setImage(CONFIG.supportImage)
        .setFooter({ text: `Requested by ${user.tag}`, iconURL: user.displayAvatarURL() });

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_pr').setLabel('Public Relations').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_sm').setLabel('Staff Management').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_mod').setLabel('Moderation').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket_leadership').setLabel('Leadership').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_general').setLabel('General Support').setStyle(ButtonStyle.Success)
    );

    return { embed, buttons };
}

// --- EVENTS ---
client.on(Events.ClientReady, () => console.log(`Logged in as ${client.user.tag}`));

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

    // Permission logic
    const overwrites = [
        { id: guild.roles.everyone, deny: ['ViewChannel'] },
        { id: user.id, allow: ['ViewChannel', 'SendMessages', 'AttachFiles', 'ReadMessageHistory'] }
    ];
    if (type !== 'support') overwrites.push({ id: CONFIG.roles[type], allow: ['ViewChannel', 'SendMessages', 'ManageChannels', 'ReadMessageHistory'] });

    const channel = await guild.channels.create({
        name: `ticket-${ticketData.ticketCounter}`,
        type: 0,
        parent: CONFIG.ticketCategoryId,
        permissionOverwrites: overwrites
    });

    ticketData.activeTickets[channel.id] = { userId: user.id, type, createdAt: Date.now() };
    ticketData.ticketCounter++;
    saveTicketData();

    const ticketEmbed = new EmbedBuilder()
        .setTitle(`🎫 ${interaction.component.label} Ticket`)
        .setDescription(`Hello ${user}, a staff member will be with you shortly.`)
        .setColor('#00FFFF');

    await channel.send({ content: `<@${user.id}>`, embeds: [ticketEmbed] });
    await interaction.reply({ content: `Ticket created: <#${channel.id}>`, ephemeral: true });
});

// --- PREFIX COMMANDS ---
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.content.startsWith('?')) return;
    const args = message.content.slice(1).split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'supportpanel') {
        const { embed, buttons } = createSupportPanel(message.author);
        return message.channel.send({ embeds: [embed], components: [buttons] });
    }

    if (command === 'stopcat' || command === 'startcat') {
        const cat = args[0];
        if (!cat) return message.reply('Please provide a category.');
        ticketData.pausedCategories[cat] = command === 'stopcat';
        saveTicketData();
        return message.reply(`${cat} category ${command === 'stopcat' ? 'paused' : 'resumed'}.`);
    }

    if (command === 'stop' || command === 'start') {
        const sub = args[0];
        if (!sub) return message.reply('Please provide a subheader.');
        ticketData.pausedSubtopics[sub] = command === 'stop';
        saveTicketData();
        return message.reply(`${sub} ${command === 'stop' ? 'paused' : 'resumed'}.`);
    }

    if (command === 'close') {
        const ticket = ticketData.activeTickets[message.channel.id];
        if (!ticket) return message.reply('This is not a ticket channel.');

        const transcript = `Ticket by <@${ticket.userId}> closed at ${new Date().toLocaleString()}`;
        const transcriptChannel = await client.channels.fetch(CONFIG.transcriptsChannelId);
        transcriptChannel.send({ content: transcript });

        delete ticketData.activeTickets[message.channel.id];
        saveTicketData();
        await message.channel.delete();
    }
});

// --- LOGIN ---
client.login(process.env.BOT_TOKEN_1);

