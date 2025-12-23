// ===================
// Adalea Tickets v2 Clone - FINAL PRODUCTION FILE (V19 - STABILITY FIX)
// ===================
import {
    Client,
    GatewayIntentBits,
    Partials,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    EmbedBuilder,
    PermissionsBitField,
    ChannelType,
    ApplicationCommandOptionType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import fs from 'fs';
import express from 'express';
import dotenv from 'dotenv';
import fetch from 'node-fetch'; // ✅ ADDED (Render keepalive)

dotenv.config();

// ===================
// EXPRESS SETUP FOR RENDER (DO NOT TOUCH)
// ===================
const app = express();
app.get('/', (req, res) => res.send('Bot is running'));
app.listen(process.env.PORT || 3000);

// ✅ KEEPALIVE (PREVENTS RENDER SLEEP / BUTTON DEATH)
setInterval(() => {
    fetch(`http://localhost:${process.env.PORT || 3000}`).catch(() => {});
}, 1000 * 60 * 5);

// ===================
// CLIENT SETUP
// ===================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message],
});

const BOT_TOKEN = process.env.BOT_TOKEN_1;

// ===================
// ID CONFIGURATION
// ===================
const IDs = {
    GUILD: '1402400197040013322',
    leadership: '1402400285674049576',
    special: '1107787991444881408',
    moderation: '1402411949593202800',
    staffing: '1402416194354544753',
    pr: '1402416210779312249',
    hr: '1402400473344114748',
    transcriptLog: '1437112357787533436',
    ticketCategory: '1437139682361344030',
};

// ===================
// CATEGORIES & SUBTOPICS
// ===================
const categories = {
    moderation: {
        name: 'Moderation Support',
        key: 'moderation',
        role: IDs.moderation,
        emoji: '<:c_flower:1437125663231315988>',
        subtopics: [
            { key: 'appeal', label: 'Appealing', value: 'Appealing a warning, mute, kick, or server ban.' },
            { key: 'report', label: 'Reporting', value: 'Reporting rule-breaking behaviour within our server.' },
            { key: 'custom_roles', label: 'Custom Booster Roles', value: 'Inquiries regarding custom roles for server boosters.' },
            { key: 'other_mod', label: 'Other Mod Enquiry', value: 'Other moderation related enquiries.' }
        ],
    },
    staffing: {
        name: 'Staffing Enquiries',
        key: 'staffing',
        role: IDs.staffing,
        emoji: '<:flower_yellow:1437121213796188221>',
        subtopics: [
            { key: 'staff_report', label: 'Reporting', value: 'Reporting a member of staff, MR, or HR.' },
            { key: 'applications', label: 'Applications', value: 'Applying for a MR or HR position at Adalea.' },
            { key: 'other_staffing', label: 'Other Staffing Enquiry', value: 'Other staffing related enquiries.' }
        ],
    },
    pr: {
        name: 'Public Relations Enquiries',
        key: 'pr',
        role: IDs.pr,
        emoji: '<:flower_pink:1437121075086622903>',
        subtopics: [
            { key: 'affiliation', label: 'Affiliation', value: 'Forming a partnership between your group and Adalea.' },
            { key: 'prize_claim', label: 'Prize claim', value: 'Claiming your prize after winning an event.' },
            { key: 'other_pr', label: 'Other PR Enquiry', value: 'Other public relations related enquiries.' }
        ],
    },
    general: { name: 'General', key: 'general', role: IDs.hr, emoji: '<:flower_blue:1415086940306276424>', subtopics: null },
    leadership: { name: 'Leadership', key: 'leadership', role: IDs.leadership, emoji: '<:flower_green:1437121005821759688>', subtopics: null },
};

// ===================
// HELPERS
// ===================
const getCategoryByKey = (key) => categories[key];
const getSubtopicValueByKey = (categoryKey, subtopicKey) =>
    categories[categoryKey]?.subtopics?.find(s => s.key === subtopicKey)?.value;
const getSubtopicLabelByKey = (categoryKey, subtopicKey) =>
    categories[categoryKey]?.subtopics?.find(s => s.key === subtopicKey)?.label;

// ===================
// TICKET STORAGE
// ===================
const ticketDataPath = './ticketData.json';
let tickets = {};

if (fs.existsSync(ticketDataPath)) {
    try {
        const data = fs.readFileSync(ticketDataPath, 'utf8');
        tickets = data ? JSON.parse(data) : {};
    } catch {
        tickets = {};
    }
}

tickets.counters ??= {};
Object.keys(categories).forEach(k => tickets.counters[k] ??= 1);

const saveTickets = () =>
    fs.writeFileSync(ticketDataPath, JSON.stringify(tickets, null, 4));

// ===================
// COOLDOWNS & STATE
// ===================
const cooldowns = {};
const COOLDOWN_SECONDS = 34;

const hasCooldown = (id) =>
    cooldowns[id] && Date.now() - cooldowns[id] < COOLDOWN_SECONDS * 1000;

// ===================
// MESSAGE COMMAND HANDLER
// ===================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith('?')) return;

    const [cmd] = message.content.slice(1).toLowerCase().split(' ');
    const member = message.member;
    const isLeaderOrSpecial =
        member.roles.cache.has(IDs.leadership) ||
        message.author.id === IDs.special;

    if (cmd === 'supportpanel' && isLeaderOrSpecial) {
        try {
            const embed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('Adalea Support')
                .setDescription('Select a category below.');

            const row = new ActionRowBuilder().addComponents(
                Object.values(categories).map(c =>
                    new ButtonBuilder()
                        .setLabel(c.name)
                        .setCustomId(`category_${c.name.toLowerCase().replace(/\s/g, '-')}`)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji(c.emoji)
                )
            );

            await message.channel.send({ embeds: [embed], components: [row] });
            await message.delete().catch(() => {});
        } catch (e) {
            console.error(e);
        }
    }
});

// =========================================================================================
// INTERACTION HANDLER (SAFE / CRASH-PROOF)
// =========================================================================================
client.on('interactionCreate', async interaction => {
    try {        // ===================
        // 1. CATEGORY BUTTONS
        // ===================
        if (interaction.isButton() && interaction.customId.startsWith('category_')) {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true });
            }

            const rawCatName = interaction.customId.replace('category_', '');
            const catKey = Object.keys(categories).find(
                k => categories[k].name.toLowerCase().replace(/\s/g, '-') === rawCatName
            );

            if (!catKey) {
                return interaction.editReply({ content: 'Category not found.' }).catch(() => {});
            }

            if (hasCooldown(interaction.user.id)) {
                return interaction.editReply({
                    content: `You are on cooldown. Please wait ${COOLDOWN_SECONDS} seconds.`
                }).catch(() => {});
            }

            const category = categories[catKey];

            if (category.subtopics) {
                const menu = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`subtopic_${catKey}`)
                        .setPlaceholder('Select the issue')
                        .addOptions(
                            category.subtopics.map(s => ({
                                label: s.label.substring(0, 100),
                                value: s.key.substring(0, 100),
                                description: s.value.substring(0, 100),
                            }))
                        )
                );

                return interaction.editReply({
                    content: 'Please select a subtopic.',
                    components: [menu],
                }).catch(() => {});
            }

            cooldowns[interaction.user.id] = Date.now();
            return createTicketChannel(interaction.user, catKey, null, interaction);
        }

        // ===================
        // 2. SUBTOPIC SELECT
        // ===================
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('subtopic_')) {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            const catKey = interaction.customId.replace('subtopic_', '');
            const subtopicKey = interaction.values[0];

            if (hasCooldown(interaction.user.id)) {
                return interaction.editReply({
                    content: `You are on cooldown. Please wait ${COOLDOWN_SECONDS} seconds.`,
                    components: [],
                }).catch(() => {});
            }

            cooldowns[interaction.user.id] = Date.now();
            return createTicketChannel(interaction.user, catKey, subtopicKey, interaction);
        }

        // ===================
        // 3. SLASH COMMANDS
        // ===================
        if (interaction.isChatInputCommand()) {
            const channelId = interaction.channelId;
            const member = interaction.member;

            // --- /CLAIM ---
            if (interaction.commandName === 'claim') {
                if (!tickets[channelId]) {
                    return interaction.reply({
                        content: 'This is not an active ticket channel.',
                        ephemeral: true,
                    });
                }

                if (
                    !member.roles.cache.has(IDs.leadership) &&
                    !member.roles.cache.has(IDs.hr) &&
                    interaction.user.id !== IDs.special
                ) {
                    return interaction.reply({
                        content: 'You do not have permission to claim tickets.',
                        ephemeral: true,
                    });
                }

                if (tickets[channelId].claimed) {
                    return interaction.reply({
                        content: `Already claimed by <@${tickets[channelId].claimed}>.`,
                        ephemeral: true,
                    });
                }

                tickets[channelId].claimed = interaction.user.id;
                saveTickets();

                const embed = new EmbedBuilder()
                    .setColor(0x32cd32)
                    .setDescription(`✅ <@${interaction.user.id}> has claimed this ticket.`);

                return interaction.reply({ embeds: [embed] });
            }

            // --- /CLOSE ---
            if (interaction.commandName === 'close') {
                if (!tickets[channelId]) {
                    return interaction.reply({
                        content: 'This is not an active ticket channel.',
                        ephemeral: true,
                    });
                }

                if (
                    !member.roles.cache.has(IDs.leadership) &&
                    !member.roles.cache.has(IDs.hr) &&
                    interaction.user.id !== IDs.special
                ) {
                    return interaction.reply({
                        content: 'You do not have permission to close tickets.',
                        ephemeral: true,
                    });
                }

                const modal = new ModalBuilder()
                    .setCustomId(`close_modal_${channelId}`)
                    .setTitle('Close Ticket');

                const reasonInput = new TextInputBuilder()
                    .setCustomId('close_reason')
                    .setLabel('Reason for closing')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(reasonInput)
                );

                return interaction.showModal(modal);
            }

            // --- /TICKET SUBCOMMANDS ---
            if (interaction.commandName === 'ticket') {
                const subcommand = interaction.options.getSubcommand();
                const channel = interaction.channel;

                if (!tickets[channel.id]) {
                    return interaction.reply({
                        content: 'This command can only be used in a ticket.',
                        ephemeral: true,
                    });
                }

                const user = interaction.options.getUser('user');

                try {
                    if (subcommand === 'add') {
                        await channel.permissionOverwrites.edit(user.id, {
                            ViewChannel: true,
                            SendMessages: true,
                        });
                        return interaction.reply({
                            content: `${user.tag} added to the ticket.`,
                        });
                    }

                    if (subcommand === 'remove') {
                        await channel.permissionOverwrites.edit(user.id, {
                            ViewChannel: false,
                        });
                        return interaction.reply({
                            content: `${user.tag} removed from the ticket.`,
                        });
                    }
                } catch (e) {
                    console.error(e);
                    return interaction.reply({
                        content: 'Error executing command.',
                        ephemeral: true,
                    }).catch(() => {});
                }
            }
        }

    } catch (error) {
        console.error('INTERACTION ERROR:', error);
        if (interaction.deferred || interaction.replied) {
            interaction.editReply({
                content: 'An internal error occurred.',
            }).catch(() => {});
        }
    }
});// ===================
// 4. CLOSE MODAL SUBMIT
// ===================
client.on('interactionCreate', async interaction => {
    if (!interaction.isModalSubmit()) return;
    if (!interaction.customId.startsWith('close_modal_')) return;

    const channelId = interaction.customId.replace('close_modal_', '');
    const reason = interaction.fields.getTextInputValue('close_reason');
    const ticket = tickets[channelId];

    if (!ticket) {
        return interaction.reply({
            content: 'Ticket data not found.',
            ephemeral: true,
        });
    }

    ticket.closed = true;
    saveTickets();

    await interaction.deferReply({ ephemeral: true });

    const ticketChannel =
        interaction.guild.channels.cache.get(channelId) ||
        await interaction.guild.channels.fetch(channelId).catch(() => null);

    try {
        const subtopicLabel = ticket.subtopic
            ? getSubtopicLabelByKey(ticket.category, ticket.subtopic)
            : 'N/A';

        // ===== TRANSCRIPT =====
        let transcript =
            `--- Adalea Ticket Transcript ---\n` +
            `Ticket ID: ${channelId}\n` +
            `Category: ${categories[ticket.category]?.name}\n` +
            `Subtopic: ${subtopicLabel}\n` +
            `Opened By: ${ticket.user}\n` +
            `Closed By: ${interaction.user.tag}\n` +
            `Reason: ${reason}\n\n`;

        let messages = [];
        let lastId;

        while (true) {
            const fetched = await ticketChannel.messages.fetch({
                limit: 100,
                before: lastId,
            });
            messages.push(...fetched.values());
            if (fetched.size < 100) break;
            lastId = fetched.last().id;
        }

        messages
            .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
            .forEach(msg => {
                transcript += `[${new Date(msg.createdTimestamp).toLocaleString()}] ${msg.author.tag}: ${msg.content || '[No Content]'}\n`;
                msg.attachments.forEach(a => {
                    transcript += `[Attachment] ${a.url}\n`;
                });
            });

        const fileName = `${ticketChannel.name}.txt`;
        fs.writeFileSync(fileName, transcript);

        const logChannel = await client.channels.fetch(IDs.transcriptLog).catch(() => null);

        if (logChannel) {
            const embed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle(`🎟️ Ticket Closed`)
                .addFields(
                    { name: 'Ticket', value: ticketChannel.name, inline: true },
                    { name: 'Opened By', value: `<@${ticket.user}>`, inline: true },
                    { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Reason', value: reason }
                );

            await logChannel.send({
                embeds: [embed],
                files: [{ attachment: fileName, name: fileName }],
            });
        }

        // ===== DM USER =====
        try {
            const user = await client.users.fetch(ticket.user);
            await user.send({
                content: 'Your ticket has been closed.',
                files: [{ attachment: fileName, name: fileName }],
            });
        } catch {}

        fs.unlinkSync(fileName);

        await interaction.editReply({
            content: 'Ticket closed. Deleting channel in 5 seconds.',
        });

        setTimeout(() => {
            ticketChannel.delete().catch(() => {});
        }, 5000);

        delete tickets[channelId];
        saveTickets();

    } catch (err) {
        console.error('CLOSE ERROR:', err);
        ticket.closed = false;
        saveTickets();
        await interaction.editReply({
            content: 'An error occurred while closing the ticket.',
        }).catch(() => {});
    }
});

// ===================
// TICKET CREATION
// ===================
async function createTicketChannel(user, categoryKey, subtopicKey, interaction) {
    const guild = interaction.guild;
    const cat = categories[categoryKey];

    const number = tickets.counters[categoryKey]++;
    const padded = number.toString().padStart(3, '0');
    const name = `${categoryKey}-${padded}`;

    const channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: IDs.ticketCategory,
        permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            ...(cat.role ? [{ id: cat.role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : []),
            { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels] },
        ],
    });

    const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle(`${cat.name} Ticket`)
        .setDescription(`Welcome <@${user.id}>! Please explain your issue.`)
        .setFooter({ text: `Ticket ID: ${channel.id}` });

    await channel.send({
        content: `<@&${cat.role}> | <@${user.id}>`,
        embeds: [embed],
    });

    tickets[channel.id] = {
        user: user.id,
        category: categoryKey,
        subtopic: subtopicKey,
        claimed: null,
        closed: false,
        openTime: Date.now(),
    };

    saveTickets();

    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
            content: `Ticket created: ${channel}`,
        }).catch(() => {});
    }
}

// ===================
// COMMAND REGISTRATION
// ===================
const commands = [
    { name: 'claim', description: 'Claim the current ticket.' },
    { name: 'close', description: 'Close the current ticket.' },
    {
        name: 'ticket',
        description: 'Ticket management.',
        options: [
            {
                name: 'add',
                description: 'Add a user.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'user',
                        description: 'User to add.',
                        type: ApplicationCommandOptionType.User,
                        required: true,
                    },
                ],
            },
            {
                name: 'remove',
                description: 'Remove a user.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: 'user',
                        description: 'User to remove.',
                        type: ApplicationCommandOptionType.User,
                        required: true,
                    },
                ],
            },
        ],
    },
];

// ===================
// READY
// ===================
client.once('ready', async () => {
    console.log(`🤖 ${client.user.tag} is online and stable.`);
    await client.application.commands.set(commands);
});

client.login(BOT_TOKEN);