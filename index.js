// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, Events, InteractionType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel]
});

// -------------------- Config --------------------
const config = {
    guildId: '1402400197040013322',
    categories: {
        general: '1437139682361344030',
        mod: '1437120764921774132',
        pr: '1437119092745175231',
        sm: '1437120003533967370',
        leadership: '1437120465054335147'
    },
    roles: {
        pr: '1402416210779312249',
        sm: '1402416194354544753',
        mod: '1402411949593202800',
        leadership: '1402400285674049576',
        support: '1402417889826443356',
        special: '1107787991444881408'
    },
    transcriptsChannel: '1437112357787533436',
    supportImage: 'https://cdn.discordapp.com/attachments/1402405357812187287/1403398794695016470/support3.png?ex=691203fa&is=6910b27a&hm=98455f5668e0716fd1af76309303cc5c6e3a860692bfacca15375fff89018d87',
    emojis: {
        general: '<:c_flower:1437125663231315988>',
        pr: '<:flower_yellow:1437121213796188221>',
        sm: '<:flower_pink:1437121075086622903>',
        mod: '<:flower_blue:1415086940306276424>',
        leadership: '<:flower_green:1437121005821759688>'
    },
    bloxlinkGroupId: '250548768'
};

// -------------------- Storage --------------------
let ticketCounter = 1;
const pausedCategories = {}; // e.g., { general: false }
const pausedSubtopics = {}; // e.g., { pr_eventclaim: false }
const activeTickets = {}; // ticketId: {channelId, creatorId, category, subtopic, claimedBy}

// Load persistent data
const dataFile = path.join(__dirname, 'ticketData.json');
if(fs.existsSync(dataFile)){
    const raw = fs.readFileSync(dataFile);
    const saved = JSON.parse(raw);
    ticketCounter = saved.ticketCounter || 1;
    Object.assign(pausedCategories, saved.pausedCategories || {});
    Object.assign(pausedSubtopics, saved.pausedSubtopics || {});
    Object.assign(activeTickets, saved.activeTickets || {});
}
function saveData() {
    fs.writeFileSync(dataFile, JSON.stringify({ ticketCounter, pausedCategories, pausedSubtopics, activeTickets }, null, 2));
}

// -------------------- Helper Functions --------------------
async function createTicketChannel(creator, categoryId, categoryName, subtopic, roleToPing) {
    const guild = client.guilds.cache.get(config.guildId);
    const channelName = `${creator.username.toLowerCase()}-${ticketCounter.toString().padStart(4,'0')}`;
    const everyone = guild.roles.everyone;
    ticketCounter++;
    saveData();

    const channel = await guild.channels.create({
        name: channelName,
        type: 0,
        parent: categoryId,
        permissionOverwrites: [
            { id: everyone.id, deny: ['ViewChannel'] },
            { id: creator.id, allow: ['ViewChannel','SendMessages','ReadMessageHistory'] },
            { id: config.roles.special, allow: ['ViewChannel','SendMessages','ReadMessageHistory'] },
            ...(roleToPing ? [{ id: roleToPing, allow: ['ViewChannel','SendMessages','ReadMessageHistory'] }] : [])
        ]
    });

    activeTickets[channel.id] = {
        channelId: channel.id,
        creatorId: creator.id,
        category: categoryName,
        subtopic: subtopic,
        claimedBy: null
    };
    saveData();

    const embed = new EmbedBuilder()
        .setTitle(`Ticket - ${categoryName}`)
        .setDescription(`Thank you for opening a ticket with Adalea Support! A member of the ${categoryName} team will be with you shortly.`)
        .addFields([
            { name: 'User', value: `${creator.tag} / Fetching Roblox...` },
            { name: 'Subtopic', value: subtopic },
            { name: 'Date', value: new Date().toLocaleString() }
        ])
        .setThumbnail('https://cdn.discordapp.com/embed/avatars/0.png')
        .setColor(0xFFA500)
        .setImage(config.supportImage);

    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('claim').setLabel('Claim').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('close').setLabel('Close').setStyle(ButtonStyle.Danger)
        );

    await channel.send({ content: roleToPing ? `<@&${roleToPing}>` : null, embeds: [embed], components: [buttons] });
    return channel;
}

// -------------------- Support Panel --------------------
client.on(Events.MessageCreate, async message => {
    if(message.author.bot) return;
    if(message.content.toLowerCase() === '!supportpanel'){
        if(![config.roles.leadership, config.roles.special].some(r => message.member.roles.cache.has(r))) return;
        await message.delete();

        const embed = new EmbedBuilder()
            .setTitle('<:verified:1406645489381806090> Adalea Support Panel')
            .setDescription(
`Welcome to Adalea's Support Panel! This channel is designed to help you connect with the right team efficiently. Please select the category that best fits your needs before opening a ticket: Staff Management, Public Relations, Moderation, General, or Leadership. Choosing the correct category ensures your request is directed to the team most capable of assisting you quickly and effectively.

Once you select a category, you will have the opportunity to provide more details about your issue so that the appropriate team can respond accurately. We value your patience, respect, and collaboration while we work to resolve your concerns. Our goal is to provide clear and timely support to everyone in the Adalea community.`
            )
            .setColor(0xFFA500)
            .setImage(config.supportImage);

        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('general').setLabel('General').setEmoji(config.emojis.general).setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('pr').setLabel('Public Relations').setEmoji(config.emojis.pr).setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('sm').setLabel('Staff Management').setEmoji(config.emojis.sm).setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('mod').setLabel('Moderation').setEmoji(config.emojis.mod).setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('leadership').setLabel('Leadership').setEmoji(config.emojis.leadership).setStyle(ButtonStyle.Success)
            );

        await message.channel.send({ embeds: [embed], components: [buttons] });
    }
});

// -------------------- Interactions --------------------
client.on(Events.InteractionCreate, async interaction => {
    if(interaction.isButton()){
        const id = interaction.customId;
        // Check paused categories
        if(pausedCategories[id]){
            return interaction.reply({ content: '<a:Zcheck:1437064263570292906> Sorry, this category is paused.', ephemeral: true });
        }

        // Handle category clicks
        if(id === 'general'){
            await createTicketChannel(interaction.user, config.categories.general, 'Support Team', 'General', config.roles.support);
            return interaction.reply({ content: 'Your ticket has been created!', ephemeral: true });
        } else {
            // TODO: Send dropdown for PR, SM, Leadership, Moderation
        }
    }

    // TODO: Handle dropdown selections, claim, close, add/remove/move commands, pauses
});

// -------------------- Login --------------------
client.login(process.env.BOT_TOKEN_1);
