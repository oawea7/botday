import fs from 'fs';
import express from 'express';
import { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events, StringSelectMenuBuilder } from 'discord.js';
import { config } from 'dotenv';
import axios from 'axios';

config();

const app = express();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// --- CONFIG ---
const CONFIG = {
    guildId: '1402400197040013322',
    ticketCategoryId: '1437139682361344030',
    roles: {
        publicRelations: '1402416210779312249',
        staffEnquiries: '1402416194354544753',
        moderationSupport: '1402411949593202800',
        leadership: '1402400285674049576',
        support: '1402417889826443356',
        specialUser: '1107787991444881408'
    },
    transcriptsChannelId: '1437112357787533436',
    supportImage: 'https://cdn.discordapp.com/attachments/1402405357812187287/1403398794695016470/support3.png',
    emojis: {
        publicRelations: '<:flower_yellow:1437121213796188221>',
        staffEnquiries: '<:flower_pink:1437121075086622903>',
        moderationSupport: '<:flower_blue:1415086940306276424>',
        leadership: '<:flower_green:1437121005821759688>',
        general: '<:c_flower:1437125663231315988>'
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

function saveTicketData() {
    fs.writeFileSync(ticketDataPath, JSON.stringify(ticketData, null, 2));
}

// --- HELPERS ---
function createTicketEmbed(user, categoryLabel) {
    return new EmbedBuilder()
        .setTitle(`🎫 ${categoryLabel} Ticket`)
        .setDescription(`Hello ${user}, a staff member will be with you shortly.`)
        .setColor('#00FFFF')
        .setImage(CONFIG.supportImage)
        .setThumbnail(user.displayAvatarURL());
}

function createCategoryButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_publicRelations')
            .setLabel(`${CONFIG.emojis.publicRelations} Public Relations Enquiries`)
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('ticket_staffEnquiries')
            .setLabel(`${CONFIG.emojis.staffEnquiries} Staff Enquiries`)
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('ticket_moderationSupport')
            .setLabel(`${CONFIG.emojis.moderationSupport} Moderation Support`)
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('ticket_leadership')
            .setLabel(`${CONFIG.emojis.leadership} Leadership`)
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ticket_general')
            .setLabel(`${CONFIG.emojis.general} General Support`)
            .setStyle(ButtonStyle.Success)
    );
}

function createSubtopicDropdown(category) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`subtopic_${category}`)
            .setPlaceholder('Select a subtopic')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions([
                { label: 'General Issue', value: 'general' },
                { label: 'Specific Request', value: 'specific' },
                { label: 'Other', value: 'other' }
            ])
    );
}

// --- EVENTS ---
client.on(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
    const { user, guild, customId } = interaction;
    if (!guild || guild.id !== CONFIG.guildId) return;

    // Handle category button
    if (customId.startsWith('ticket_')) {
        const category = customId.split('_')[1];
        const dropdown = createSubtopicDropdown(category);
        return interaction.reply({ content: 'Select your ticket subtopic:', components: [dropdown], ephemeral: true });
    }

    // Handle subtopic dropdown
    if (customId.startsWith('subtopic_')) {
        const category = customId.split('_')[1];
        const subtopic = interaction.values[0];

        const channel = await guild.channels.create({
            name: `ticket-${ticketData.ticketCounter}`,
            type: 0,
            parent: CONFIG.ticketCategoryId,
            permissionOverwrites: [
                { id: guild.roles.everyone, deny: ['ViewChannel'] },
                { id: user.id, allow: ['ViewChannel', 'SendMessages', 'AttachFiles', 'ReadMessageHistory'] },
                { id: CONFIG.roles[category], allow: ['ViewChannel', 'SendMessages', 'ManageChannels', 'ReadMessageHistory'] }
            ]
        });

        ticketData.activeTickets[channel.id] = { userId: user.id, category, subtopic, createdAt: Date.now() };
        ticketData.ticketCounter++;
        saveTicketData();

        const embed = createTicketEmbed(user, category);
        await channel.send({ content: `<@${user.id}>`, embeds: [embed], components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('claim').setLabel('Claim').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('close').setLabel('Close').setStyle(ButtonStyle.Danger)
            )
        ]});

        return interaction.update({ content: `Ticket created: <#${channel.id}>`, components: [], ephemeral: true });
    }

    // Handle claim/close buttons in ticket channel
    if (customId === 'claim' || customId === 'close') {
        const ticket = ticketData.activeTickets[interaction.channel.id];
        if (!ticket) return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });

        if (customId === 'claim') {
            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setDescription(`<@${user.id}> will be handling this ticket.`)
                    .setColor('#00FFFF')
                ],
                ephemeral: false
            });
        }

        if (customId === 'close') {
            const transcriptText = `Ticket by <@${ticket.userId}>\nCategory: ${ticket.category}\nSubtopic: ${ticket.subtopic}\nOpened: ${new Date(ticket.createdAt).toLocaleString()}\nClosed: ${new Date().toLocaleString()}`;
            fs.writeFileSync(`./transcript-${interaction.channel.id}.txt`, transcriptText);

            const transcriptChannel = await client.channels.fetch(CONFIG.transcriptsChannelId);
            await transcriptChannel.send({ content: `Transcript for <#${interaction.channel.id}>`, files: [`./transcript-${interaction.channel.id}.txt`] });

            delete ticketData.activeTickets[interaction.channel.id];
            saveTicketData();
            await interaction.channel.delete();
        }
    }
});

// --- PREFIX COMMANDS ---
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.content.startsWith('?')) return;
    const args = message.content.slice(1).split(/ +/);
    const command = args.shift().toLowerCase();

    // Start/Stop categories or subtopics
    if (command === 'supportpanel') {
        const channel = message.channel;
        const embed = new EmbedBuilder()
            .setTitle('🎫 Support Panel')
            .setDescription('Click a button below to open a ticket.')
            .setColor('#00FFFF')
            .setImage(CONFIG.supportImage);
        await channel.send({ embeds: [embed], components: [createCategoryButtons()] });
    }

    if (['stopcat','startcat'].includes(command) && args[0]) {
        const cat = args[0];
        if (ticketData.pausedCategories[cat] !== undefined) {
            ticketData.pausedCategories[cat] = (command === 'stopcat');
            saveTicketData();
            message.reply(`Category ${cat} has been ${(command==='stopcat'?'paused':'resumed')}.`);
        }
    }

    if (['stop','start'].includes(command) && args[0]) {
        const sub = args[0];
        ticketData.pausedSubtopics[sub] = (command === 'stop');
        saveTicketData();
        message.reply(`Subtopic ${sub} has been ${(command==='stop'?'paused':'resumed')}.`);
    }
});

// --- DEPLOY ---
client.login(process.env.BOT_TOKEN_1);
